// miniprogram/pages/station-ranking/station-ranking.js
import * as echarts from '../../components/ec-canvas/echarts';

const app = getApp();

const CONFIG = {
  BASIC_DATA_FUNCTION: 'getBasicData',
  HOURLY_DATA_FUNCTION: 'getHourlyDemands',
  USE_MOCK_DATA: false,
  DEBUG_MODE: false
};

let globalStationData = null;
let globalDailyStatistics = null;
let globalCompareData = null;

Page({
  data: {
    currentMode: 'ranking',
    rankingType: 'total',
    showFullList: false,
    rankingList: [],
    stationList: [],
    selectedStations: [],
    compareData: null,
    showStationPicker: false,
    ec: { onInit: null }
  },

  onLoad() {
    // 关键修复：在 onLoad 时就设置 ec.onInit
    this.setData({
      ec: {
        onInit: this.initChart.bind(this)
      }
    });
    this.loadData();
  },

  async loadData() {
    wx.showLoading({ title: '加载中...', mask: true });
    
    try {
      if (!globalStationData) {
        const res = await wx.cloud.callFunction({
          name: CONFIG.BASIC_DATA_FUNCTION,
          data: {}
        });
        
        if (res.result && res.result.success) {
          const basicData = res.result.data;
          globalDailyStatistics = basicData.dailyStatistics || [];
          globalStationData = this.processStationData(basicData.stations || []);
        } else {
          throw new Error(res.result?.error || '数据格式错误');
        }
        
        if (app.globalData) {
          app.globalData.stationRankingData = globalStationData;
          app.globalData.dailyStatistics = globalDailyStatistics;
        }
      }
      
      this.initDataFromGlobal();
      wx.hideLoading();
      wx.showToast({ title: '加载成功', icon: 'success', duration: 1500 });
    } catch (error) {
      console.error('加载失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '加载失败',
        content: error.toString(),
        showCancel: false
      });
    }
  },

  processStationData(stations) {
    if (stations.length === 0) return [];
    
    return stations.map(station => {
      const totalDemand = station.totalDemand || 0;
      const avgDemand = station.avgDemand || (totalDemand / 31);
      const maxDemand = station.maxDemand || avgDemand * 2;
      const weekdayAvg = station.weekdayAvg || avgDemand;
      const weekendAvg = station.weekendAvg || avgDemand * 0.9;
      
      // 计算标准差和变异系数
      const stdDev = station.stdDev || 0;
      const cv = avgDemand > 0 ? (stdDev / avgDemand) : 0;
      
      return {
        ...station,
        totalDemand,
        avgDemand,
        maxDemand,
        weekdayAvg,
        weekendAvg,
        stdDev,
        cv
      };
    });
  },

  initDataFromGlobal() {
    if (!globalStationData || globalStationData.length === 0) {
      wx.showToast({ title: '暂无数据', icon: 'none' });
      return;
    }
    
    const formattedData = this.formatStationData(globalStationData);
    this.setData({ stationList: formattedData });
    this.calculateRanking();
  },

  formatStationData(rawData) {
    return rawData.map(station => {
      const totalDemandDisplay = this.formatNumber(station.totalDemand);
      const avgDemandDisplay = this.formatNumber(station.avgDemand, 1);
      const maxDemand = station.maxDemand || 0;
      const weekdayAvgDisplay = this.formatNumber(station.weekdayAvg, 1);
      const weekendAvgDisplay = this.formatNumber(station.weekendAvg, 1);
      const cvDisplay = station.cv ? station.cv.toFixed(2) : '0.00';
      
      return {
        ...station,
        totalDemandDisplay,
        avgDemandDisplay,
        maxDemand,
        weekdayAvgDisplay,
        weekendAvgDisplay,
        cvDisplay
      };
    });
  },

  formatNumber(num, decimals = 0) {
    if (num === undefined || num === null) return '0';
    const value = Number(num);
    if (isNaN(value)) return '0';
    if (value >= 10000) return (value / 10000).toFixed(1) + 'w';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return value.toFixed(decimals);
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ currentMode: mode });
    if (mode === 'compare' && this.data.selectedStations.length >= 2) {
      setTimeout(() => this.updateCompareChart(), 300);
    }
  },

  changeRankingType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ rankingType: type, showFullList: false });
    this.calculateRanking();
  },

  calculateRanking() {
    const { stationList, rankingType } = this.data;
    if (!stationList || stationList.length === 0) return;
    
    let sortedList = [...stationList];
    
    switch (rankingType) {
      case 'total':
        sortedList.sort((a, b) => (b.totalDemand || 0) - (a.totalDemand || 0));
        break;
      case 'avg':
        sortedList.sort((a, b) => (b.avgDemand || 0) - (a.avgDemand || 0));
        break;
      case 'peak':
        sortedList.sort((a, b) => (b.maxDemand || 0) - (a.maxDemand || 0));
        break;
    }
    
    const maxValue = this.getMaxValue(sortedList, rankingType);
    sortedList = sortedList.map((item, index) => ({
      ...item,
      rank: index + 1,
      progressWidth: this.calculateProgressWidth(item, rankingType, maxValue)
    }));
    
    this.setData({ rankingList: sortedList });
  },

  getValueByType(item, type) {
    switch (type) {
      case 'total': return item.totalDemand;
      case 'avg': return item.avgDemand?.toFixed(1);
      case 'peak': return item.maxDemand;
      default: return 0;
    }
  },

  getMaxValue(list, type) {
    if (list.length === 0) return 1;
    switch (type) {
      case 'total': return list[0].totalDemand || 1;
      case 'avg': return list[0].avgDemand || 1;
      case 'peak': return list[0].maxDemand || 1;
      default: return 1;
    }
  },

  calculateProgressWidth(item, type, maxValue) {
    let value = 0;
    switch (type) {
      case 'total': value = item.totalDemand || 0; break;
      case 'avg': value = item.avgDemand || 0; break;
      case 'peak': value = item.maxDemand || 0; break;
    }
    const percentage = (value / maxValue) * 100;
    return `${Math.min(percentage, 100)}%`;
  },

  toggleFullList() {
    this.setData({ showFullList: !this.data.showFullList });
  },

  viewStationDetail(e) {
    const stationId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/station-detail/station-detail?id=${stationId}`,
      fail: () => wx.showToast({ title: '详情页面开发中', icon: 'none' })
    });
  },

  openStationPicker() {
    const { stationList, selectedStations } = this.data;
    const selectedIds = selectedStations.map(s => s.stationId);
    const listWithSelection = stationList.map(station => ({
      ...station,
      isSelected: selectedIds.includes(station.stationId)
    }));
    this.setData({ stationList: listWithSelection, showStationPicker: true });
  },

  closeStationPicker() {
    this.setData({ showStationPicker: false });
  },

  selectStation(e) {
    const stationId = e.currentTarget.dataset.id;
    const { stationList, selectedStations } = this.data;
    
    if (selectedStations.some(s => s.stationId === stationId)) {
      wx.showToast({ title: '该站点已添加', icon: 'none' });
      return;
    }
    
    if (selectedStations.length >= 5) {
      wx.showToast({ title: '最多选择5个站点', icon: 'none' });
      return;
    }
    
    const station = stationList.find(s => s.stationId === stationId);
    if (station) {
      const newSelected = [...selectedStations, station];
      this.setData({ selectedStations: newSelected, showStationPicker: false });
      if (newSelected.length >= 2) this.updateCompareData();
    }
  },

  removeStation(e) {
    const stationId = e.currentTarget.dataset.id;
    const newSelected = this.data.selectedStations.filter(s => s.stationId !== stationId);
    this.setData({ selectedStations: newSelected });
    if (newSelected.length >= 2) {
      this.updateCompareData();
    } else {
      this.setData({ compareData: null });
    }
  },

  updateCompareData() {
    const { selectedStations } = this.data;
    const compareData = {};
    selectedStations.forEach(station => {
      compareData[station.stationId] = station;
    });
    globalCompareData = compareData;
    this.setData({ compareData });
    setTimeout(() => this.updateCompareChart(), 300);
  },

  // 修复后的 initChart 方法 - 计算正确的容器宽度
  initChart(canvas, width, height, dpr) {
    console.log('========================================');
    console.log('=== 雷达图初始化 - 详细调试信息 ===');
    console.log('========================================');
    console.log('1. 传入参数:');
    console.log('   - width:', width);
    console.log('   - height:', height);
    console.log('   - dpr:', dpr);
    
    // 使用系统信息计算真实容器宽度
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const screenHeight = systemInfo.windowHeight;
    const rpxToPx = screenWidth / 750;
    
    console.log('2. 系统信息:');
    console.log('   - screenWidth:', screenWidth);
    console.log('   - screenHeight:', screenHeight);
    console.log('   - rpxToPx:', rpxToPx);
    console.log('   - pixelRatio:', systemInfo.pixelRatio);
    
    // 修复：正确计算所有padding
    // .container: padding 20rpx (左右各20rpx)
    // .chart-section: padding 30rpx 0rpx (左右各0rpx) - 已修改！
    // 总计左右padding: 20 * 2 = 40rpx
    const containerPadding = 20; // .container 左右padding (rpx)
    const chartSectionPadding = 0; // .chart-section 左右padding (rpx) - 修改为0
    const totalHorizontalPadding = (containerPadding + chartSectionPadding) * 2;
    const totalPaddingPx = totalHorizontalPadding * rpxToPx;
    const containerWidth = screenWidth - totalPaddingPx;
    
    console.log('3. Padding 计算:');
    console.log('   - containerPadding (rpx):', containerPadding);
    console.log('   - chartSectionPadding (rpx):', chartSectionPadding);
    console.log('   - totalHorizontalPadding (rpx):', totalHorizontalPadding);
    console.log('   - totalPaddingPx (px):', totalPaddingPx);
    console.log('   - 计算的containerWidth (px):', containerWidth);
    
    console.log('4. 图表容器高度:');
    const chartHeightRpx = 850; // .chart-container 的高度（已增加）
    const chartHeightPx = chartHeightRpx * rpxToPx;
    console.log('   - 设置的高度 (rpx):', chartHeightRpx);
    console.log('   - 转换后高度 (px):', chartHeightPx);
    console.log('   - 传入的height参数 (px):', height);
    
    // 使用计算的宽度初始化图表
    const chart = echarts.init(canvas, null, {
      width: containerWidth,
      height: height,
      devicePixelRatio: dpr
    });
    
    console.log('5. ECharts 初始化配置:');
    console.log('   - 初始化width:', containerWidth);
    console.log('   - 初始化height:', height);
    console.log('   - devicePixelRatio:', dpr);
    
    canvas.setChart(chart);
    this.chart = chart;
    
    // 🔧 关键修复：立即强制resize到正确的宽度
    chart.resize({
      width: containerWidth,
      height: height
    });
    console.log('   - 立即resize完成');
    
    // 延迟再调整多次，确保正确
    setTimeout(() => {
      if (this.chart) {
        this.chart.resize({
          width: containerWidth,
          height: height
        });
        console.log('6. Resize 完成 (100ms):');
        console.log('   - resize width:', containerWidth);
        console.log('   - resize height:', height);
      }
    }, 100);
    
    setTimeout(() => {
      if (this.chart) {
        this.chart.resize({
          width: containerWidth,
          height: height
        });
        console.log('7. Resize 完成 (300ms):');
        console.log('   - resize width:', containerWidth);
        console.log('   - resize height:', height);
        console.log('========================================');
      }
    }, 300);
    
    return chart;
  },

  updateCompareChart() {
    console.log('========================================');
    console.log('=== 更新雷达图 - 详细调试信息 ===');
    console.log('========================================');
    
    if (!this.chart) {
      console.error('❌ 图表实例未初始化');
      return;
    }
    
    if (!this.data.compareData) {
      console.error('❌ 对比数据为空');
      return;
    }
    
    const { selectedStations } = this.data;
    if (selectedStations.length < 2) {
      console.error('❌ 需要至少选择2个站点, 当前:', selectedStations.length);
      return;
    }
    
    console.log('✅ 选中站点数:', selectedStations.length);
    console.log('✅ 选中站点列表:', selectedStations.map(s => s.name).join(', '));
    
    const stations = selectedStations.map(s => s.name);
    
    // 计算各指标的最大值
    const maxTotal = Math.max(...selectedStations.map(s => s.totalDemand || 0));
    const maxAvg = Math.max(...selectedStations.map(s => s.avgDemand || 0));
    const maxPeak = Math.max(...selectedStations.map(s => s.maxDemand || 0));
    const maxWeekday = Math.max(...selectedStations.map(s => s.weekdayAvg || 0));
    const maxWeekend = Math.max(...selectedStations.map(s => s.weekendAvg || 0));
    const maxCV = Math.max(...selectedStations.map(s => s.cv || 0));
    
    console.log('1. 各指标最大值:');
    console.log('   - maxTotal:', maxTotal);
    console.log('   - maxAvg:', maxAvg);
    console.log('   - maxPeak:', maxPeak);
    console.log('   - maxWeekday:', maxWeekday);
    console.log('   - maxWeekend:', maxWeekend);
    // maxCV 已删除
    
    // 设置雷达图指标,确保最大值合理（删除变异系数）
    const indicators = [
      { name: '总需求', max: maxTotal > 0 ? maxTotal * 1.1 : 1000 },
      { name: '平均需求', max: maxAvg > 0 ? maxAvg * 1.1 : 100 },
      { name: '峰值需求', max: maxPeak > 0 ? maxPeak * 1.1 : 100 },
      { name: '工作日', max: maxWeekday > 0 ? maxWeekday * 1.1 : 100 },
      { name: '周末', max: maxWeekend > 0 ? maxWeekend * 1.1 : 100 }
    ];
    
    console.log('2. 雷达图指标配置:');
    indicators.forEach((ind, idx) => {
      console.log(`   ${idx + 1}. ${ind.name}: max=${ind.max}`);
    });
    
    // 构建系列数据（删除变异系数）
    const seriesData = selectedStations.map((station, idx) => {
      const data = [
        station.totalDemand || 0,
        station.avgDemand || 0,
        station.maxDemand || 0,
        station.weekdayAvg || 0,
        station.weekendAvg || 0
      ];
      console.log(`3.${idx + 1} 站点"${station.name}"的数据:`);
      console.log(`   - 总需求: ${data[0]}`);
      console.log(`   - 平均需求: ${data[1]}`);
      console.log(`   - 峰值需求: ${data[2]}`);
      console.log(`   - 工作日: ${data[3]}`);
      console.log(`   - 周末: ${data[4]}`);
      
      return {
        value: data,
        name: station.name
      };
    });
    
    // 获取当前图表尺寸
    const chartWidth = this.chart.getWidth();
    const chartHeight = this.chart.getHeight();
    console.log('4. 当前图表尺寸:');
    console.log('   - width:', chartWidth);
    console.log('   - height:', chartHeight);
    
    // 🔧 关键修复：如果图表宽度不正确，强制resize
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const rpxToPx = screenWidth / 750;
    const totalHorizontalPadding = 40; // 修改：只有container的padding，左右共40rpx
    const expectedWidth = screenWidth - (totalHorizontalPadding * rpxToPx);
    
    if (Math.abs(chartWidth - expectedWidth) > 1) {
      console.log('   ⚠️ 检测到宽度不正确！');
      console.log('   - 当前宽度:', chartWidth);
      console.log('   - 期望宽度:', expectedWidth);
      console.log('   - 执行强制resize...');
      
      this.chart.resize({
        width: expectedWidth,
        height: chartHeight
      });
      
      // 重新获取尺寸
      const newWidth = this.chart.getWidth();
      const newHeight = this.chart.getHeight();
      console.log('   - resize后宽度:', newWidth);
      console.log('   - resize后高度:', newHeight);
    }
    
    // 🔧 关键修复：使用绝对像素值，基于容器宽度而不是高度
    // 为了让雷达图更宽，使用容器宽度的85%作为直径
    const actualChartWidth = this.chart.getWidth();
    const radarRadiusPx = Math.floor(actualChartWidth * 0.85 / 2);
    console.log('5. 雷达图配置:');
    console.log('   - center: [50%, 42%]');
    console.log('   - radius (计算): ' + radarRadiusPx + 'px (基于容器宽度)');
    console.log('   - shape: polygon');
    console.log('   - splitNumber: 4');
    console.log('   - 预期直径(px):', radarRadiusPx * 2);
    console.log('   - 容器宽度利用率:', ((radarRadiusPx * 2 / actualChartWidth) * 100).toFixed(1) + '%');
    
    const option = {
      color: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'],
      tooltip: {
        trigger: 'item',
        formatter: params => {
          const labels = ['总需求', '平均需求', '峰值需求', '工作日', '周末'];  // 删除变异系数
          let content = `<strong>${params.name}</strong><br/>`;
          params.value.forEach((val, idx) => {
            let displayVal = val;
            if (val >= 10000) {
              displayVal = (val / 10000).toFixed(1) + 'w';
            } else if (val >= 1000) {
              displayVal = (val / 1000).toFixed(1) + 'k';
            } else {
              displayVal = val.toFixed(1);
            }
            content += `${labels[idx]}: ${displayVal}<br/>`;
          });
          return content;
        }
      },
      legend: {
        data: stations,
        bottom: 10,  // 修复：从 5 增加到 10，给更多底部空间
        left: 'center',
        textStyle: { 
          fontSize: 11,
          color: '#333'
        },
        itemWidth: 15,
        itemHeight: 10
      },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        center: ['50%', '48%'],  // 🔧 修改：从42%调整到48%，向下移动给顶部更多空间
        radius: radarRadiusPx * 0.75,  // 🔧 修改：从90%减小到75%，给所有方向的标签留出更多空间
        splitNumber: 4,
        name: { 
          textStyle: { 
            color: '#666', 
            fontSize: 9,  // 🔧 修改：从10再减小到9
            fontWeight: 'normal'
          }
        },
        splitLine: { 
          lineStyle: { 
            color: '#e0e0e0',
            width: 1
          } 
        },
        splitArea: {
          show: true,
          areaStyle: { 
            color: ['rgba(255, 255, 255, 0.05)', 'rgba(102, 126, 234, 0.05)'] 
          }
        },
        axisLine: { 
          lineStyle: { 
            color: '#e0e0e0',
            width: 1
          } 
        }
      },
      series: [{
        type: 'radar',
        data: seriesData,
        areaStyle: { 
          opacity: 0.15
        },
        lineStyle: { 
          width: 2
        },
        symbol: 'circle',
        symbolSize: 5,
        itemStyle: {
          borderWidth: 2,
          borderColor: '#fff'
        },
        emphasis: {
          lineStyle: {
            width: 3
          },
          areaStyle: {
            opacity: 0.3
          }
        }
      }]
    };
    
    try {
      this.chart.setOption(option, true);
      console.log('✅ 雷达图更新成功');
      console.log('========================================');
    } catch (error) {
      console.error('❌ 图表更新失败:', error);
      console.log('========================================');
      wx.showToast({
        title: '图表更新失败',
        icon: 'none'
      });
    }
  },

  onShow() {
    if (globalStationData) this.initDataFromGlobal();
  },

  onPullDownRefresh() {
    globalStationData = null;
    globalDailyStatistics = null;
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  onUnload() {}
});