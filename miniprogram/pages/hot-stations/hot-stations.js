// pages/hot-stations/hot-stations.js
Page({
  data: {
    topStations: [],
    totalDemand: '0',
    avgDemand: '0',
    loading: true
  },

  onLoad(options) {
    this.loadHotStations();
  },

  /**
   * 加载热门站点数据
   */
  async loadHotStations() {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      
      // 分页查询所有站点（应对20条限制）
      const batchSize = 20;
      const queries = [];
      
      for (let i = 0; i < 5; i++) {
        queries.push(
          db.collection('stations')
            .limit(batchSize)
            .skip(i * batchSize)
            .field({
              stationId: true,
              name: true,
              address: true,
              totalDemand: true,
              avgDemand: true,
              peakHour: true
            })
            .get()
        );
      }
      
      // 并行执行所有查询
      const results = await Promise.all(queries);
      
      // 合并所有结果
      let stations = [];
      results.forEach(result => {
        if (result.data && result.data.length > 0) {
          stations = stations.concat(result.data);
        }
      });

      console.log(`获取到 ${stations.length} 个站点`);

      // 按总需求量排序
      stations.sort((a, b) => b.totalDemand - a.totalDemand);

      // 取前10名
      const top10 = stations.slice(0, 10);

      // 计算最大需求量（用于百分比计算）
      const maxDemand = top10[0].totalDemand;

      // 计算需求等级
      const demands = stations.map(s => s.totalDemand || 0).sort((a, b) => a - b);
      const len = demands.length;
      const q1 = demands[Math.floor(len * 0.25)];
      const q2 = demands[Math.floor(len * 0.5)];
      const q3 = demands[Math.floor(len * 0.75)];

      // 处理数据
      const processedTop10 = top10.map((station, index) => {
        // 计算需求等级
        const demand = station.totalDemand || 0;
        let demandLevel;
        if (demand <= q1) demandLevel = 1;
        else if (demand <= q2) demandLevel = 2;
        else if (demand <= q3) demandLevel = 3;
        else demandLevel = 4;

        const demandLevelMap = {
          1: '低需求',
          2: '中需求',
          3: '高需求',
          4: '超高需求'
        };

        return {
          ...station,
          rank: index + 1,
          demandLevel: demandLevel,
          demandLevelText: demandLevelMap[demandLevel],
          totalDemandDisplay: this.formatNumber(station.totalDemand),
          demandPercent: ((station.totalDemand / maxDemand) * 100).toFixed(1)
        };
      });

      // 计算统计数据
      const totalDemandValue = top10.reduce((sum, s) => sum + s.totalDemand, 0);
      const avgDemandValue = Math.round(totalDemandValue / top10.length);

      this.setData({
        topStations: processedTop10,
        totalDemand: this.formatNumber(totalDemandValue),
        avgDemand: this.formatNumber(avgDemandValue),
        loading: false
      });

    } catch (error) {
      console.error('加载热门站点失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 跳转到站点详情
   */
  goToStationDetail(e) {
    const stationId = e.currentTarget.dataset.stationId;
    wx.navigateTo({
      url: `/pages/station-detail/station-detail?stationId=${stationId}`,
      fail: () => {
        wx.showToast({
          title: '页面开发中',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 格式化数字
   */
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadHotStations().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '热门站点Top10排行榜',
      path: '/pages/hot-stations/hot-stations'
    };
  }
});
