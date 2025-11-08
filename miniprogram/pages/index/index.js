// pages/index/index.js

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 概览数据
    overviewData: {
      totalStations: 0,
      dataDays: 31,
      totalDemand: 0,
      totalDemandDisplay: '0',
      avgDailyDemand: 0,
      avgDailyDemandDisplay: '0'
    },

    // 地图配置
    mapCenter: {
      latitude: 22.5431, // 深圳市中心纬度
      longitude: 114.0579 // 深圳市中心经度
    },
    mapScale: 11,
    markers: [],

    // 站点信息弹窗
    showStationInfo: false,
    selectedStation: null,

    // 最近查看
    recentStations: [],

    // 加载状态
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('首页加载');
    this.initPage();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 每次显示页面时刷新最近查看
    this.loadRecentStations();
  },

  /**
   * 初始化页面
   */
  async initPage() {
    this.setData({ loading: true });

    try {
      // 并行加载数据
      await Promise.all([
        this.loadOverviewData(),
        this.loadStationList()
      ]);
    } catch (error) {
      console.error('初始化页面失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载概览数据
   */
  async loadOverviewData() {
    try {
      const db = wx.cloud.database();
      
      // 获取站点总数
      const stationsCount = await db.collection('stations').count();
      
      // 获取总需求量（从日统计表汇总）
      const demandResult = await db.collection('daily_statistics')
        .aggregate()
        .group({
          _id: null,
          totalDemand: db.command.aggregate.sum('$totalDemand')
        })
        .end();

      const totalDemand = demandResult.list[0]?.totalDemand || 0;
      const avgDailyDemand = Math.round(totalDemand / 31);

      this.setData({
        'overviewData.totalStations': stationsCount.total,
        'overviewData.totalDemand': totalDemand,
        'overviewData.totalDemandDisplay': this.formatNumber(totalDemand),
        'overviewData.avgDailyDemand': avgDailyDemand,
        'overviewData.avgDailyDemandDisplay': this.formatNumber(avgDailyDemand)
      });

    } catch (error) {
      console.error('加载概览数据失败:', error);
      throw error;
    }
  },

  /**
   * 加载站点列表并生成地图标记
   */
  async loadStationList() {
    try {
      const db = wx.cloud.database();
      
      // 获取所有站点信息
      const result = await db.collection('stations')
        .field({
          stationId: true,
          name: true,
          latitude: true,
          longitude: true,
          totalDemand: true,
          avgDemand: true,
          demandLevel: true,
          address: true
        })
        .get();

      const stations = result.data;

      // 生成地图标记点
      const markers = stations.map(station => {
        return {
          id: station.stationId,
          latitude: station.latitude,
          longitude: station.longitude,
          iconPath: this.getMarkerIcon(station.demandLevel),
          width: 40,
          height: 40,
          callout: {
            content: station.name,
            color: '#333333',
            fontSize: 12,
            borderRadius: 8,
            bgColor: '#ffffff',
            padding: 8,
            display: 'BYCLICK'
          }
        };
      });

      this.setData({
        markers: markers
      });

      // 保存站点数据到页面实例，供后续使用
      this.stationsData = stations;

    } catch (error) {
      console.error('加载站点列表失败:', error);
      throw error;
    }
  },

  /**
   * 根据需求等级获取标记图标
   */
  getMarkerIcon(demandLevel) {
    const iconMap = {
      1: '/images/marker-low.png',      // 蓝色 - 低需求
      2: '/images/marker-medium.png',   // 绿色 - 中需求
      3: '/images/marker-high.png',     // 黄色 - 高需求
      4: '/images/marker-very-high.png' // 红色 - 超高需求
    };
    return iconMap[demandLevel] || iconMap[2];
  },

  /**
   * 地图标记点击事件
   */
  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const station = this.stationsData.find(s => s.stationId === markerId);

    if (station) {
      const demandLevelMap = {
        1: '低需求',
        2: '中需求',
        3: '高需求',
        4: '超高需求'
      };

      this.setData({
        showStationInfo: true,
        selectedStation: {
          ...station,
          demandLevelText: demandLevelMap[station.demandLevel] || '未知'
        }
      });

      // 记录到最近查看
      this.addToRecent(station);
    }
  },

  /**
   * 关闭站点信息弹窗
   */
  closeStationInfo() {
    this.setData({
      showStationInfo: false
    });
  },

  /**
   * 地图区域变化事件
   */
  onRegionChange(e) {
    // 可以在这里处理地图缩放、移动等事件
    if (e.type === 'end') {
      console.log('地图区域变化结束', e.detail);
    }
  },

  /**
   * 重置地图中心
   */
  resetMapCenter() {
    this.setData({
      mapCenter: {
        latitude: 22.5431,
        longitude: 114.0579
      },
      mapScale: 11
    });
  },

  /**
   * 前往站点详情页
   */
  goToStationDetail() {
    const stationId = this.data.selectedStation.stationId;
    wx.navigateTo({
      url: `/pages/station-detail/station-detail?stationId=${stationId}`
    });
  },

  /**
   * 前往热门站点页面
   */
  goToHotStations() {
    wx.navigateTo({
      url: '/pages/hot-stations/hot-stations'
    });
  },

  /**
   * 前往数据分析页面
   */
  goToAnalysis() {
    wx.navigateTo({
      url: '/pages/analysis/analysis'
    });
  },

  /**
   * 前往我的收藏页面
   */
  goToFavorites() {
    wx.navigateTo({
      url: '/pages/favorites/favorites'
    });
  },

  /**
   * 前往趋势报告页面
   */
  goToTrends() {
    wx.navigateTo({
      url: '/pages/trends/trends'
    });
  },

  /**
   * 加载最近查看记录
   */
  loadRecentStations() {
    try {
      const recent = wx.getStorageSync('recentStations') || [];
      
      // 只显示最近5条
      const displayRecent = recent.slice(0, 5).map(item => ({
        ...item,
        color: this.getRandomColor()
      }));

      this.setData({
        recentStations: displayRecent
      });
    } catch (error) {
      console.error('加载最近查看失败:', error);
    }
  },

  /**
   * 添加到最近查看
   */
  addToRecent(station) {
    try {
      let recent = wx.getStorageSync('recentStations') || [];

      // 移除已存在的同一站点
      recent = recent.filter(item => item.stationId !== station.stationId);

      // 添加到最前面
      recent.unshift({
        stationId: station.stationId,
        name: station.name,
        viewTime: this.formatTime(new Date())
      });

      // 只保留最近20条
      recent = recent.slice(0, 20);

      wx.setStorageSync('recentStations', recent);
      this.loadRecentStations();
    } catch (error) {
      console.error('保存最近查看失败:', error);
    }
  },

  /**
   * 清空最近查看
   */
  clearRecent() {
    wx.showModal({
      title: '提示',
      content: '确定要清空最近查看记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('recentStations');
          this.setData({
            recentStations: []
          });
          wx.showToast({
            title: '已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 格式化数字（千分位）
   */
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();

    const formatNumber = n => n < 10 ? '0' + n : n;

    return `${month}-${day} ${formatNumber(hour)}:${formatNumber(minute)}`;
  },

  /**
   * 获取随机颜色（用于最近查看图标）
   */
  getRandomColor() {
    const colors = [
      '#667eea',
      '#764ba2',
      '#f093fb',
      '#4facfe',
      '#43e97b',
      '#fa709a',
      '#fee140'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.initPage().then(() => {
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      });
    });
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '城市交通需求分析系统',
      path: '/pages/index/index',
      imageUrl: '/images/share-cover.png'
    };
  }
});