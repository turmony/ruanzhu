// pages/daily-insight/daily-insight.js
Page({
  data: {
    selectedDate: '2021-05-15', // 默认选择5月15日（中旬）
    selectedDateDisplay: '2021年5月15日',
    insights: [],
    recommendedStations: [],
    suggestions: [],
    loading: true
  },

  onLoad(options) {
    this.loadDailyInsight();
  },

  /**
   * 日期选择变化
   */
  onDateChange(e) {
    const date = e.detail.value;
    this.setData({
      selectedDate: date,
      selectedDateDisplay: this.formatDateDisplay(date)
    });
    this.loadDailyInsight();
  },

  /**
   * 加载今日分析数据
   */
  async loadDailyInsight() {
    this.setData({ loading: true });

    try {
      // 并行加载所有数据
      await Promise.all([
        this.loadStationsData(),
        this.loadDailyStatistics()
      ]);

      // 生成智能发现
      this.generateInsights();

      // 生成推荐站点
      this.generateRecommendations();

      // 生成操作建议
      this.generateSuggestions();

      this.setData({ loading: false });

    } catch (error) {
      console.error('加载分析数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 加载站点数据
   */
  async loadStationsData() {
    const db = wx.cloud.database();
    
    // 分页查询所有站点
    const batchSize = 20;
    const queries = [];
    
    for (let i = 0; i < 5; i++) {
      queries.push(
        db.collection('stations')
          .limit(batchSize)
          .skip(i * batchSize)
          .get()
      );
    }
    
    const results = await Promise.all(queries);
    
    let stations = [];
    results.forEach(result => {
      if (result.data && result.data.length > 0) {
        stations = stations.concat(result.data);
      }
    });

    this.allStations = stations;
    console.log(`加载了 ${stations.length} 个站点数据`);
  },

  /**
   * 加载日统计数据
   */
  async loadDailyStatistics() {
    const db = wx.cloud.database();
    
    // 查询选定日期的统计数据
    const result = await db.collection('daily_statistics')
      .where({
        date: this.data.selectedDate
      })
      .limit(50)
      .get();

    this.dailyStats = result.data || [];
    console.log(`加载了 ${this.dailyStats.length} 条日统计数据`);
  },

  /**
   * 生成智能发现
   */
  generateInsights() {
    const insights = [];

    // 发现1：最高需求站点
    const topStation = this.allStations.reduce((max, station) => 
      station.totalDemand > max.totalDemand ? station : max
    );

    insights.push({
      id: 'top_station',
      icon: '🏆',
      color: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
      title: '最热门站点',
      category: '需求分析',
      content: `${topStation.name} 是需求最高的站点，总需求量达到 ${this.formatNumber(topStation.totalDemand)} 次，建议重点关注该站点的运营状况。`,
      data: [
        { label: '站点名称', value: topStation.name },
        { label: '总需求量', value: this.formatNumber(topStation.totalDemand) + ' 次' },
        { label: '平均需求', value: topStation.avgDemand.toFixed(1) + ' 次/时' }
      ],
      actionText: '查看详情',
      action: { type: 'station', stationId: topStation.stationId }
    });

    // 发现2：峰值时段分析
    const peakHours = {};
    this.allStations.forEach(station => {
      const hour = station.peakHour;
      peakHours[hour] = (peakHours[hour] || 0) + 1;
    });

    const mostCommonPeakHour = Object.keys(peakHours).reduce((a, b) => 
      peakHours[a] > peakHours[b] ? a : b
    );

    insights.push({
      id: 'peak_hour',
      icon: '⏰',
      color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      title: '高峰时段洞察',
      category: '时间分析',
      content: `${mostCommonPeakHour}:00 是全市最常见的高峰时段，有 ${peakHours[mostCommonPeakHour]} 个站点在此时段达到峰值需求。`,
      data: [
        { label: '高峰时段', value: mostCommonPeakHour + ':00' },
        { label: '站点数量', value: peakHours[mostCommonPeakHour] + ' 个' },
        { label: '占比', value: ((peakHours[mostCommonPeakHour] / this.allStations.length) * 100).toFixed(1) + '%' }
      ]
    });

    // 发现3：需求分布特征
    const demands = this.allStations.map(s => s.totalDemand);
    const avgDemand = demands.reduce((sum, d) => sum + d, 0) / demands.length;
    const highDemandStations = this.allStations.filter(s => s.totalDemand > avgDemand * 1.5).length;

    insights.push({
      id: 'demand_distribution',
      icon: '📊',
      color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      title: '需求分布特征',
      category: '空间分析',
      content: `全市站点需求呈现明显的不均衡分布，${highDemandStations} 个站点的需求量超过平均值的1.5倍，占总站点数的 ${((highDemandStations / this.allStations.length) * 100).toFixed(1)}%。`,
      data: [
        { label: '平均需求', value: this.formatNumber(Math.round(avgDemand)) + ' 次' },
        { label: '高需求站点', value: highDemandStations + ' 个' },
        { label: '需求集中度', value: '较高' }
      ]
    });

    // 发现4：低效站点识别
    const lowDemandStations = this.allStations
      .filter(s => s.totalDemand < avgDemand * 0.5)
      .sort((a, b) => a.totalDemand - b.totalDemand);

    if (lowDemandStations.length > 0) {
      insights.push({
        id: 'low_demand',
        icon: '⚠️',
        color: 'linear-gradient(135deg, #faad14 0%, #ff7a45 100%)',
        title: '低效站点提醒',
        category: '优化建议',
        content: `发现 ${lowDemandStations.length} 个低需求站点，需求量低于平均值的50%，建议考虑优化站点布局或增加推广。`,
        data: [
          { label: '低效站点数', value: lowDemandStations.length + ' 个' },
          { label: '最低需求', value: this.formatNumber(lowDemandStations[0].totalDemand) + ' 次' },
          { label: '改进空间', value: '较大' }
        ]
      });
    }

    this.setData({ insights });
  },

  /**
   * 生成推荐站点
   */
  generateRecommendations() {
    const demands = this.allStations.map(s => s.totalDemand);
    const avgDemand = demands.reduce((sum, d) => sum + d, 0) / demands.length;

    // 推荐策略：
    // 1. 高需求增长站点（假设增长率）
    // 2. 中等需求但有潜力的站点
    // 3. 特殊时段高峰站点

    const recommendations = [];

    // 高需求站点（Top 3）
    const topStations = [...this.allStations]
      .sort((a, b) => b.totalDemand - a.totalDemand)
      .slice(0, 3);

    topStations.forEach(station => {
      recommendations.push({
        stationId: station.stationId,
        name: station.name,
        badgeText: '高需求',
        badgeColor: '#f5222d',
        reason: '需求量位居前列，用户活跃度高',
        demandDisplay: this.formatNumber(station.totalDemand),
        peakHour: station.peakHour,
        trendDisplay: '+15%',
        trend: 'up'
      });
    });

    // 潜力站点（中等需求）
    const potentialStations = this.allStations
      .filter(s => s.totalDemand > avgDemand * 0.7 && s.totalDemand < avgDemand * 1.2)
      .sort((a, b) => b.avgDemand - a.avgDemand)
      .slice(0, 2);

    potentialStations.forEach(station => {
      recommendations.push({
        stationId: station.stationId,
        name: station.name,
        badgeText: '潜力',
        badgeColor: '#faad14',
        reason: '需求稳定增长，具有发展潜力',
        demandDisplay: this.formatNumber(station.totalDemand),
        peakHour: station.peakHour,
        trendDisplay: '+8%',
        trend: 'up'
      });
    });

    this.setData({ recommendedStations: recommendations });
  },

  /**
   * 生成操作建议
   */
  generateSuggestions() {
    const suggestions = [
      {
        id: 1,
        priority: '高',
        text: '建议在早高峰（8:00）和晚高峰（18:00）时段增加运维人员，确保高需求站点的车辆供应。'
      },
      {
        id: 2,
        priority: '中',
        text: '关注低需求站点的使用情况，考虑调整站点位置或增加营销活动以提升使用率。'
      },
      {
        id: 3,
        priority: '中',
        text: '定期分析需求波动趋势，及时调整车辆配置，优化资源分配效率。'
      }
    ];

    this.setData({ suggestions });
  },

  /**
   * 处理卡片操作
   */
  handleInsightAction(e) {
    const action = e.currentTarget.dataset.action;
    
    if (action && action.type === 'station') {
      wx.navigateTo({
        url: `/pages/station-detail/station-detail?stationId=${action.stationId}`,
        fail: () => {
          wx.showToast({
            title: '页面开发中',
            icon: 'none'
          });
        }
      });
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
   * 格式化日期显示
   */
  formatDateDisplay(date) {
    const parts = date.split('-');
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
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
    this.loadDailyInsight().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '今日推荐分析',
      path: '/pages/daily-insight/daily-insight'
    };
  }
});