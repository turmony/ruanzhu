// miniprogram/pages/station-detail/station-detail.js
import * as echarts from '../../components/ec-canvas/echarts';

Page({
  data: {
    // 站点列表
    stationList: [],
    stationIndex: 0,
    currentStationName: '加载中...',
    
    // 站点基本信息
    stationInfo: {
      stationId: 0,
      name: '',
      avgDemand: 0
    },
    
    // 日期选择
    startDate: '2021-05-01',
    endDate: '2021-05-07',
    
    // 当前Tab
    currentTab: 'chart',
    
    // 图表类型
    chartType: 'line',
    
    // 统计数据
    statistics: {
      totalDemand: 0,
      avgDemand: 0,
      maxDemand: 0,
      minDemand: 0,
      peakTime: '',
      peakValue: 0,
      valleyTime: '',
      valleyValue: 0,
      stdDev: 0,
      cv: 0,
      stabilityDesc: ''
    },
    
    // 表格数据
    tableData: [],
    
    // 图表数据
    demandData: [],
    
    // ECharts配置
    ec: {
      onInit: null
    },
    
    // 加载状态
    loading: false,
    
    // 图表实例
    chart: null
  },

  onLoad(options) {
    // 获取传入的站点ID
    const stationId = parseInt(options.stationId || 5);
    
    // 初始化站点信息
    this.setData({
      'stationInfo.stationId': stationId,
      'ec.onInit': this.initChart.bind(this)
    });
    
    // 加载站点列表
    this.loadStationList(stationId);
    
    // 加载站点详情
    this.loadStationInfo();
    
    // 加载需求数据
    this.loadDemandData();
    
  },

  onShareAppMessage() {
    return {
      title: `${this.data.stationInfo.name} - 站点详情`,
      path: `/pages/station-detail/station-detail?stationId=${this.data.stationInfo.stationId}`
    };
  },

  // 加载站点列表（分批获取所有数据）
  async loadStationList(currentStationId) {
    try {
      const db = wx.cloud.database();
      const MAX_LIMIT = 20;
      let allStations = [];
      
      // 先获取总数
      const countResult = await db.collection('stations').count();
      const total = countResult.total;
      
      console.log('站点总数:', total);
      
      // 计算需要请求的次数
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      
      // 分批获取所有数据
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        const promise = db.collection('stations')
          .field({
            stationId: true,
            name: true,
            latitude: true,
            longitude: true
          })
          .orderBy('stationId', 'asc')
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get();
        tasks.push(promise);
      }
      
      // 等待所有请求完成
      const results = await Promise.all(tasks);
      
      // 合并所有数据
      results.forEach(res => {
        allStations = allStations.concat(res.data);
      });
      
      console.log('成功加载站点数:', allStations.length);
      
      // 处理数据，确保每个站点都有name
      const stationList = allStations.map(station => ({
        stationId: station.stationId,
        name: station.name || `站点${String(station.stationId).padStart(3, '0')}`,
        latitude: station.latitude,
        longitude: station.longitude
      }));
      
      // 找到当前站点的索引
      const currentIndex = stationList.findIndex(s => s.stationId === currentStationId);
      
      console.log('处理后的站点列表:', stationList);
      console.log('当前站点索引:', currentIndex);
      
      this.setData({
        stationList: stationList,
        stationIndex: currentIndex >= 0 ? currentIndex : 0,
        currentStationName: stationList[currentIndex >= 0 ? currentIndex : 0].name
      });
      
    } catch (err) {
      console.error('加载站点列表失败:', err);
      wx.showToast({
        title: '加载站点列表失败',
        icon: 'none'
      });
    }
  },

  // 切换站点
  onStationChange(e) {
    const index = parseInt(e.detail.value);
    const station = this.data.stationList[index];
    
    console.log('切换站点:', station);
    
    this.setData({
      stationIndex: index,
      currentStationName: station.name,
      'stationInfo.stationId': station.stationId
    });
    
    // 重新加载数据
    this.loadStationInfo();
    this.loadDemandData();
    this.checkFavoriteStatus();
  },

  // 加载站点基本信息
  async loadStationInfo() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stationService',
        data: {
          action: 'info',
          stationId: this.data.stationInfo.stationId
        }
      });
      
      if (res.result.success) {
        this.setData({
          stationInfo: res.result.data
        });
      }
    } catch (err) {
      console.error('加载站点信息失败:', err);
    }
  },

  // 加载需求数据
  async loadDemandData() {
    this.setData({ loading: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'demandService',
        data: {
          action: 'byStation',
          stationId: this.data.stationInfo.stationId,
          startDate: this.data.startDate,
          endDate: this.data.endDate
        }
      });
      
      if (res.result.success && res.result.data && res.result.data.hourlyData) {
        const data = res.result.data;
        
        // 更新数据
        this.setData({
          demandData: data.hourlyData,
          statistics: this.calculateStatistics(data.hourlyData),
          tableData: this.formatTableData(data.hourlyData)
        }, () => {
          // 数据设置完成后更新图表
          setTimeout(() => {
            this.updateChart();
          }, 100);
        });
      } else {
        wx.showToast({
          title: '暂无数据',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('加载需求数据失败:', err);
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 初始化图表 - 修复宽度问题
  initChart(canvas, width, height, dpr) {
    console.log('=== 图表初始化 ===');
    console.log('传入 width:', width, 'height:', height, 'dpr:', dpr);
    
    // 使用系统信息计算真实容器宽度
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const rpxToPx = screenWidth / 750;
    const pageHorizontalPadding = 40; // 页面左右padding总和 (20rpx * 2)
    const containerWidth = screenWidth - (pageHorizontalPadding * rpxToPx);
    
    console.log('屏幕宽度:', screenWidth);
    console.log('计算容器宽度:', containerWidth);
    
    // 使用计算的宽度初始化图表
    const chart = echarts.init(canvas, null, {
      width: containerWidth,
      height: height,
      devicePixelRatio: dpr
    });
    
    canvas.setChart(chart);
    this.chart = chart;
    
    // 延迟再调整一次，确保正确
    setTimeout(() => {
      if (this.chart) {
        this.chart.resize({
          width: containerWidth,
          height: height
        });
        console.log('图表resize完成');
      }
    }, 100);
    
    return chart;
  },

  // 更新图表
  updateChart() {
    if (!this.chart || !this.data.demandData || this.data.demandData.length === 0) {
      return;
    }
    
    let option;
    
    switch (this.data.chartType) {
      case 'line':
        option = this.getLineChartOption();
        break;
      case 'bar':
        option = this.getBarChartOption();
        break;
      case 'heatmap':
        option = this.getHeatmapOption();
        break;
    }
    
    this.chart.setOption(option, true);
  },

  // 折线图配置
  getLineChartOption() {
    const data = this.data.demandData;
    
    // 按日期分组
    const dateGroups = {};
    data.forEach(item => {
      if (!dateGroups[item.date]) {
        dateGroups[item.date] = new Array(24).fill(0);
      }
      dateGroups[item.date][item.hour] = item.demand;
    });
    
    const series = Object.keys(dateGroups).map(date => ({
      name: date,
      type: 'line',
      data: dateGroups[date],
      smooth: true,
      lineStyle: {
        width: 2
      }
    }));
    
    return {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          let result = `时间: ${params[0].name}:00\n`;
          params.forEach(item => {
            result += `${item.seriesName}: ${item.value}次\n`;
          });
          return result;
        }
      },
      legend: {
        data: Object.keys(dateGroups),
        bottom: 5,
        type: 'scroll',
        textStyle: {
          fontSize: 10
        }
      },
      grid: {
        top: 35,
        left: 50,
        right: 20,
        bottom: 50,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        name: '小时',
        nameLocation: 'middle',
        nameGap: 25,
        axisLabel: {
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        name: '需求量',
        nameTextStyle: {
          align: 'right',
          fontSize: 10
        },
        axisLabel: {
          fontSize: 10,
          formatter: value => {
            if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'k';
            }
            return value;
          }
        }
      },
      series: series
    };
  },

  // 柱状图配置
  getBarChartOption() {
    const data = this.data.demandData;
    
    // 按日期聚合
    const dailyDemand = {};
    data.forEach(item => {
      if (!dailyDemand[item.date]) {
        dailyDemand[item.date] = 0;
      }
      dailyDemand[item.date] += item.demand;
    });
    
    const dates = Object.keys(dailyDemand).sort();
    const values = dates.map(date => dailyDemand[date]);
    
    return {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          return `${params[0].name}\n需求量: ${params[0].value}次`;
        }
      },
      grid: {
        top: 35,
        left: 70,
        right: 15,
        bottom: 80,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          rotate: 45,
          interval: 0,
          fontSize: 9
        }
      },
      yAxis: {
        type: 'value',
        name: '需求量',
        nameTextStyle: {
          fontSize: 10
        },
        axisLabel: {
          fontSize: 10,
          formatter: value => {
            if (value >= 1000) {
              return (value / 1000).toFixed(1) + 'k';
            }
            return value;
          }
        }
      },
      series: [{
        type: 'bar',
        data: values,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#667eea' },
            { offset: 1, color: '#764ba2' }
          ])
        },
        barWidth: '60%'
      }]
    };
  },

  // 热力图配置
  getHeatmapOption() {
    const data = this.data.demandData;
    
    // 准备热力图数据 [小时, 日期索引, 需求量]
    const heatmapData = data.map(item => {
      const dateIndex = new Date(item.date).getDate() - 1;
      return [item.hour, dateIndex, item.demand];
    });
    
    // 获取最大值用于颜色映射
    const maxDemand = Math.max(...data.map(item => item.demand));
    
    return {
      tooltip: {
        position: 'top',
        formatter: params => {
          const hour = params.value[0];
          const day = params.value[1] + 1;
          const demand = params.value[2];
          return `5月${day}日 ${hour}:00\n需求量: ${demand}次`;
        }
      },
      grid: {
        top: 35,
        left: 50,
        right: 20,
        bottom: 85,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        name: '小时',
        splitArea: {
          show: true
        },
        axisLabel: {
          fontSize: 9
        }
      },
      yAxis: {
        type: 'category',
        data: Array.from({ length: 31 }, (_, i) => i + 1),
        name: '日期',
        splitArea: {
          show: true
        },
        axisLabel: {
          fontSize: 9
        }
      },
      visualMap: {
        min: 0,
        max: maxDemand,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
        textStyle: {
          fontSize: 9
        },
        inRange: {
          color: ['#e0f7fa', '#00bcd4', '#0097a7', '#006064']
        }
      },
      series: [{
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
  },

  // 计算统计指标
  calculateStatistics(data) {
    if (!data || data.length === 0) {
      return this.data.statistics;
    }
    
    const demands = data.map(item => item.demand);
    const totalDemand = demands.reduce((sum, val) => sum + val, 0);
    const avgDemand = (totalDemand / demands.length).toFixed(1);
    const maxDemand = Math.max(...demands);
    const minDemand = Math.min(...demands);
    
    // 找到峰值和谷值时间
    const maxItem = data.find(item => item.demand === maxDemand);
    const minItem = data.find(item => item.demand === minDemand);
    
    // 计算标准差
    const variance = demands.reduce((sum, val) => sum + Math.pow(val - avgDemand, 2), 0) / demands.length;
    const stdDev = Math.sqrt(variance).toFixed(2);
    
    // 计算变异系数
    const cv = (stdDev / avgDemand).toFixed(2);
    
    // 稳定性描述
    let stabilityDesc = '';
    if (cv < 0.3) {
      stabilityDesc = '需求非常稳定,波动较小';
    } else if (cv < 0.5) {
      stabilityDesc = '需求较为稳定,有一定波动';
    } else {
      stabilityDesc = '需求波动较大,变化明显';
    }
    
    return {
      totalDemand: totalDemand.toLocaleString(),
      avgDemand: avgDemand,
      maxDemand: maxDemand,
      minDemand: minDemand,
      peakTime: `${maxItem.date} ${maxItem.hour}:00`,
      peakValue: maxDemand,
      valleyTime: `${minItem.date} ${minItem.hour}:00`,
      valleyValue: minDemand,
      stdDev: stdDev,
      cv: cv,
      stabilityDesc: stabilityDesc
    };
  },

  // 格式化表格数据
  formatTableData(data) {
    if (!data || data.length === 0) {
      return [];
    }
    
    const avgDemand = data.reduce((sum, item) => sum + item.demand, 0) / data.length;
    
    return data.map(item => {
      let level = 'low';
      let levelText = '低峰';
      
      if (item.demand > avgDemand * 1.5) {
        level = 'high';
        levelText = '高峰';
      } else if (item.demand > avgDemand * 0.8) {
        level = 'medium';
        levelText = '中等';
      }
      
      return {
        id: `${item.date}-${item.hour}`,
        time: `${item.date} ${item.hour}:00`,
        demand: item.demand,
        level: level,
        levelText: levelText
      };
    });
  },

  // 日期选择
  onStartDateChange(e) {
    this.setData({
      startDate: e.detail.value
    });
    this.loadDemandData();
  },

  onEndDateChange(e) {
    this.setData({
      endDate: e.detail.value
    });
    this.loadDemandData();
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  // 切换图表类型
  changeChartType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ chartType: type });
    this.updateChart();
  }
});