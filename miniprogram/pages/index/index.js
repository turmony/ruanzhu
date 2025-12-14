// pages/index/index.js
// 使用分页查询解决20条限制问题

Page({
  data: {
    overviewData: {
      totalStations: 0,
      dataDays: 31,
      totalDemand: 0,
      totalDemandDisplay: '0',
      avgDailyDemand: 0,
      avgDailyDemandDisplay: '0'
    },
    mapCenter: {
      latitude: 22.5431,
      longitude: 114.0579
    },
    mapScale: 10,
    markers: [],
    showStationInfo: false,
    selectedStation: null,
    recentStations: [],
    loading: false
  },

  onLoad(options) {
    console.log('首页加载');
    this.initPage();
  },

  onShow() {
    this.loadRecentStations();
  },

  async initPage() {
    this.setData({ loading: true });

    try {
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

  async loadOverviewData() {
    try {
      const db = wx.cloud.database();
      
      const stationsCount = await db.collection('stations').count();
      
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

  async loadStationList() {
    try {
      const db = wx.cloud.database();
      
      console.log('开始分页查询站点数据...');
      
      // ⭐ 关键修改：使用分页查询获取所有数据
      // 由于环境限制，单次只能获取20条，所以分3次查询
      const batchSize = 20;
      const queries = [];
      
      // 计算需要查询几次（假设最多100个站点）
      for (let i = 0; i < 5; i++) {
        queries.push(
          db.collection('stations')
            .limit(batchSize)
            .skip(i * batchSize)
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
      
      console.log(`✅ 分页查询完成，共获取到 ${stations.length} 个站点`);

      if (stations.length === 0) {
        console.warn('⚠️ 未获取到任何站点数据');
        return;
      }

      // 计算需求等级
      const stationsWithLevel = this.calculateDemandLevels(stations);

      // 统计等级分布
      const levelCount = {
        1: 0,
        2: 0,
        3: 0,
        4: 0
      };

      stationsWithLevel.forEach(s => {
        levelCount[s.demandLevel] = (levelCount[s.demandLevel] || 0) + 1;
      });

      console.log('\n需求等级分布:');
      console.log(`🟢 等级1 (低需求): ${levelCount[1]} 个`);
      console.log(`🟡 等级2 (中需求): ${levelCount[2]} 个`);
      console.log(`🟠 等级3 (高需求): ${levelCount[3]} 个`);
      console.log(`🔴 等级4 (超高需求): ${levelCount[4]} 个`);
      console.log(`📊 总计: ${stationsWithLevel.length} 个标记\n`);

      // 生成地图标记
      const markers = stationsWithLevel.map(station => {
        return {
          id: station.stationId,
          latitude: station.latitude,
          longitude: station.longitude,
          iconPath: this.getMarkerIcon(station.demandLevel),
          // 调小标记尺寸，避免地图遮挡
          width: 28,
          height: 28,
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

      console.log(`✅ 生成 ${markers.length} 个地图标记`);

      // 保存站点数据
      this.stationsData = stationsWithLevel;

    } catch (error) {
      console.error('加载站点列表失败:', error);
      throw error;
    }
  },

  calculateDemandLevels(stations) {
    const demands = stations.map(s => s.totalDemand || 0).sort((a, b) => a - b);
    const len = demands.length;

    const q1 = demands[Math.floor(len * 0.25)];
    const q2 = demands[Math.floor(len * 0.5)];
    const q3 = demands[Math.floor(len * 0.75)];

    console.log(`四分位数: Q1=${q1}, Q2=${q2}, Q3=${q3}`);

    return stations.map(station => {
      const demand = station.totalDemand || 0;
      let level;

      if (demand <= q1) {
        level = 1;
      } else if (demand <= q2) {
        level = 2;
      } else if (demand <= q3) {
        level = 3;
      } else {
        level = 4;
      }

      return {
        ...station,
        demandLevel: level
      };
    });
  },

  getMarkerIcon(demandLevel) {
    const iconMap = {
      1: '/images/marker-low.png',
      2: '/images/marker-medium.png',
      3: '/images/marker-high.png',
      4: '/images/marker-very-high.png'
    };
    
    return iconMap[demandLevel] || iconMap[2];
  },

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

      this.addToRecent(station);
    }
  },

  closeStationInfo() {
    this.setData({
      showStationInfo: false
    });
  },

  onRegionChange(e) {
    if (e.type === 'end') {
      console.log('地图区域变化', e.detail);
    }
  },

  resetMapCenter() {
    this.setData({
      mapCenter: {
        latitude: 22.5431,
        longitude: 114.0579
      },
      mapScale: 10
    });
  },

  goToStationDetail(e) {
    let stationId;
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.stationId) {
      stationId = e.currentTarget.dataset.stationId;
    } else if (this.data.selectedStation) {
      stationId = this.data.selectedStation.stationId;
    }

    if (stationId) {
      wx.navigateTo({
        url: `/pages/station-detail/station-detail?stationId=${stationId}`,
        fail: () => {
          wx.showToast({
            title: '打开失败，请重试',
            icon: 'none'
          });
        }
      });
    }
  },

  goToHotStations() {
    wx.navigateTo({
      url: '/pages/hot-stations/hot-stations'
    });
  },

  goToDailyInsight() {
    wx.navigateTo({
      url: '/pages/daily-insight/daily-insight'
    });
  },

  // ⭐⭐⭐ 新增：跳转到站点排名页面（4.4模块）
  goToRanking() {
    wx.navigateTo({
      url: '/pages/station-ranking/station-ranking?mode=ranking',
      fail: () => {
        wx.showModal({
          title: '功能提示',
          content: '打开失败，请重试',
          showCancel: false
        });
      }
    });
  },

  goToAnalysis() {
    wx.navigateTo({
      url: '/pages/analysis/analysis',
      fail: () => {
        wx.showModal({
          title: '功能提示',
          content: '打开失败，请重试',
          showCancel: false
        });
      }
    });
  },

  goToTrends() {
    wx.navigateTo({
      url: '/pages/pattern-recognition/pattern-recognition',
      fail: () => {
        wx.showModal({
          title: '功能提示',
          content: '打开失败，请重试',
          showCancel: false
        });
      }
    });
  },

  loadRecentStations() {
    try {
      const recent = wx.getStorageSync('recentStations') || [];
      
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

  addToRecent(station) {
    try {
      let recent = wx.getStorageSync('recentStations') || [];

      recent = recent.filter(item => item.stationId !== station.stationId);

      recent.unshift({
        stationId: station.stationId,
        name: station.name,
        viewTime: this.formatTime(new Date())
      });

      recent = recent.slice(0, 20);

      wx.setStorageSync('recentStations', recent);
      this.loadRecentStations();
    } catch (error) {
      console.error('保存最近查看失败:', error);
    }
  },

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

  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  formatTime(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();

    const formatNumber = n => n < 10 ? '0' + n : n;

    return `${month}-${day} ${formatNumber(hour)}:${formatNumber(minute)}`;
  },

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

  onPullDownRefresh() {
    this.initPage().then(() => {
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      });
    });
  },

  onShareAppMessage() {
    return {
      title: '城市交通需求分析系统',
      path: '/pages/index/index'
    };
  }
});