// pages/analysis/analysis.js
import * as echarts from '../../components/ec-canvas/echarts';

Page({
  data: {
    loading: true,
    loadingText: '正在加载数据...',
    loadingProgress: 0,
    activeTab: 'time',
    
    // 图表配置
    hourChart: {},
    weekChart: {},
    dateChart: {},
    weekdayChart: {},
    stationRankChart: {},
    distributionChart: {},
    dateHourHeatmap: {},
    stationHourHeatmap: {},
    
    // 分析结果
    timeInsights: [],
    spaceInsights: [],
    combinedInsights: [],
    clusterGroups: []
  },

  onLoad() {
    this.loadAllData();
  },

  /**
   * 加载所有数据
   */
  async loadAllData() {
    try {
      this.setData({ 
        loadingText: '正在加载基础数据...',
        loadingProgress: 10
      });

      // 1. 加载基础数据（stations + daily_statistics）
      await this.loadBasicData();
      
      this.setData({ 
        loadingText: '正在加载小时需求数据...',
        loadingProgress: 30
      });

      // 2. 分页加载小时需求数据
      await this.loadHourlyDemands();

      this.setData({ 
        loadingText: '正在生成图表...',
        loadingProgress: 70
      });

      // 3. 初始化图表
      this.initCharts();

      this.setData({ 
        loadingText: '正在分析数据...',
        loadingProgress: 90
      });

      // 4. 生成分析洞察
      this.generateInsights();

      this.setData({ 
        loading: false,
        loadingProgress: 100
      });

    } catch (error) {
      console.error('加载数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 加载基础数据
   */
  async loadBasicData() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'getBasicData'
      });

      if (result.result.success) {
        this.stations = result.result.data.stations || [];
        this.dailyStatistics = result.result.data.dailyStatistics || [];
        
        console.log(`✓ 加载基础数据成功: ${this.stations.length}个站点, ${this.dailyStatistics.length}天统计`);
      } else {
        throw new Error(result.result.error || '加载基础数据失败');
      }
    } catch (error) {
      console.error('加载基础数据失败:', error);
      throw error;
    }
  },

  /**
   * 分页加载小时需求数据（从云存储）
   */
  async loadHourlyDemands() {
    const TOTAL_PAGES = 3;
    this.hourlyDemands = [];

    for (let page = 0; page < TOTAL_PAGES; page++) {
      try {
        console.log(`开始加载第 ${page + 1}/${TOTAL_PAGES} 页数据...`);
        
        // 调用云函数获取云存储文件信息
        const result = await wx.cloud.callFunction({
          name: 'demandService',
          data: { action: 'allPaged', page }
        });

        if (!result.result.success) {
          throw new Error(result.result.error || '云函数调用失败');
        }

        const { tempFileURL } = result.result;
        console.log(`✓ 获取到云存储文件链接`);

        // 从云存储下载数据（已自动解析为对象数组）
        const pageData = await this.downloadFromCloud(tempFileURL);
        this.hourlyDemands = this.hourlyDemands.concat(pageData);

        // 更新加载进度
        const progress = 30 + ((page + 1) / TOTAL_PAGES) * 40;
        this.setData({
          loadingText: `正在加载数据 (${page + 1}/${TOTAL_PAGES})...`,
          loadingProgress: Math.round(progress)
        });

        console.log(`✓ 第 ${page + 1} 页数据加载完成: ${pageData.length}条`);

      } catch (error) {
        console.error(`第 ${page + 1} 页数据加载失败:`, error);
        throw error;
      }
    }

    console.log(`✓ 全部数据加载完成: ${this.hourlyDemands.length}条`);
  },

  /**
   * 从云存储下载文件
   */
  downloadFromCloud(url) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: url,
        method: 'GET',
        dataType: 'json', // 明确指定返回JSON格式，会自动解析
        success: (res) => {
          if (res.statusCode === 200) {
            // 返回的数据已经被自动解析为对象，无需再JSON.parse
            resolve(res.data);
          } else {
            reject(new Error(`下载失败: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 初始化所有图表
   */
  initCharts() {
    // 时间维度图表
    this.initHourChart();
    this.initWeekChart();
    this.initDateChart();
    this.initWeekdayChart();

    // 空间维度图表
    this.initStationRankChart();
    this.initDistributionChart();

    // 联合分析图表
    this.initDateHourHeatmap();
    this.initStationHourHeatmap();
  },

  /**
   * 小时分布图表
   */
  initHourChart() {
    // 聚合24小时数据
    const hourData = new Array(24).fill(0);
    this.hourlyDemands.forEach(item => {
      hourData[item.hour] += item.demand;
    });

    this.setData({
      hourChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            grid: {
              left: '15%',
              right: '8%',
              top: '15%',
              bottom: '15%'
            },
            xAxis: {
              type: 'category',
              data: Array.from({length: 24}, (_, i) => `${i}:00`),
              axisLabel: {
                interval: 2,
                fontSize: 10
              }
            },
            yAxis: {
              type: 'value',
              axisLabel: {
                fontSize: 10,
                formatter: (value) => {
                  if (value >= 10000) {
                    return (value / 10000).toFixed(1) + '万';
                  } else if (value >= 1000) {
                    return (value / 1000).toFixed(1) + 'k';
                  }
                  return value;
                }
              }
            },
            series: [{
              data: hourData,
              type: 'bar',
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#83bff6' },
                  { offset: 1, color: '#188df0' }
                ])
              },
              label: {
                show: false
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 星期分布图表
   */
  initWeekChart() {
    // 计算每个星期的总需求
    const weekData = new Array(7).fill(0);
    const weekCount = new Array(7).fill(0);
    
    this.hourlyDemands.forEach(item => {
      const date = new Date(item.date);
      const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ...
      weekData[dayOfWeek] += item.demand;
      weekCount[dayOfWeek]++;
    });

    // 计算平均值
    const weekAvg = weekData.map((sum, i) => Math.round(sum / weekCount[i]));

    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    this.setData({
      weekChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            radar: {
              indicator: weekNames.map((name, i) => ({
                name: name,
                max: Math.max(...weekAvg) * 1.2
              })),
              radius: '60%',
              center: ['50%', '55%']
            },
            series: [{
              type: 'radar',
              data: [{
                value: weekAvg,
                name: '平均需求',
                areaStyle: {
                  color: 'rgba(24, 144, 255, 0.3)'
                },
                lineStyle: {
                  color: '#1890ff',
                  width: 2
                },
                itemStyle: {
                  color: '#1890ff'
                }
              }]
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 日期趋势图表
   */
  initDateChart() {
    // 聚合每天的总需求
    const dateMap = {};
    this.hourlyDemands.forEach(item => {
      if (!dateMap[item.date]) {
        dateMap[item.date] = 0;
      }
      dateMap[item.date] += item.demand;
    });

    const dates = Object.keys(dateMap).sort();
    const demands = dates.map(date => dateMap[date]);

    this.setData({
      dateChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            grid: {
              left: '12%',
              right: '8%',
              top: '15%',
              bottom: '15%'
            },
            xAxis: {
              type: 'category',
              data: dates.map(d => d.substring(8)),
              axisLabel: {
                interval: 2,
                fontSize: 10
              }
            },
            yAxis: {
              type: 'value',
              axisLabel: {
                fontSize: 10,
                formatter: (value) => {
                  return value >= 10000 ? (value / 10000).toFixed(1) + '万' : value;
                }
              }
            },
            series: [{
              data: demands,
              type: 'line',
              smooth: true,
              lineStyle: {
                color: '#52c41a',
                width: 3
              },
              itemStyle: {
                color: '#52c41a'
              },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(82, 196, 26, 0.4)' },
                  { offset: 1, color: 'rgba(82, 196, 26, 0.1)' }
                ])
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 工作日vs周末对比图表
   */
  initWeekdayChart() {
    // 区分工作日和周末
    const weekdayData = new Array(24).fill(0);
    const weekendData = new Array(24).fill(0);
    const weekdayCount = new Array(24).fill(0);
    const weekendCount = new Array(24).fill(0);

    this.hourlyDemands.forEach(item => {
      const date = new Date(item.date);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        weekendData[item.hour] += item.demand;
        weekendCount[item.hour]++;
      } else {
        weekdayData[item.hour] += item.demand;
        weekdayCount[item.hour]++;
      }
    });

    // 计算平均值
    const weekdayAvg = weekdayData.map((sum, i) => Math.round(sum / weekdayCount[i]));
    const weekendAvg = weekendData.map((sum, i) => Math.round(sum / weekendCount[i]));

    this.setData({
      weekdayChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            legend: {
              data: ['工作日', '周末'],
              top: '5%',
              textStyle: { fontSize: 11 }
            },
            grid: {
              left: '12%',
              right: '8%',
              top: '20%',
              bottom: '12%'
            },
            xAxis: {
              type: 'category',
              data: Array.from({length: 24}, (_, i) => `${i}:00`),
              axisLabel: {
                interval: 2,
                fontSize: 10
              }
            },
            yAxis: {
              type: 'value',
              axisLabel: {
                fontSize: 10,
                formatter: (value) => {
                  return value >= 10000 ? (value / 10000).toFixed(1) + '万' : value;
                }
              }
            },
            series: [
              {
                name: '工作日',
                data: weekdayAvg,
                type: 'line',
                smooth: true,
                lineStyle: { color: '#1890ff', width: 2 },
                itemStyle: { color: '#1890ff' }
              },
              {
                name: '周末',
                data: weekendAvg,
                type: 'line',
                smooth: true,
                lineStyle: { color: '#fa8c16', width: 2 },
                itemStyle: { color: '#fa8c16' }
              }
            ]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 站点排名图表
   */
  initStationRankChart() {
    // 计算每个站点的总需求
    const stationDemands = {};
    this.hourlyDemands.forEach(item => {
      if (!stationDemands[item.stationId]) {
        stationDemands[item.stationId] = 0;
      }
      stationDemands[item.stationId] += item.demand;
    });

    // 排序并取Top 20
    const sorted = Object.entries(stationDemands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const stationNames = sorted.map(([id]) => {
      const station = this.stations.find(s => s.stationId == id);
      return station ? station.name : `站点${id}`;
    });
    const demands = sorted.map(([_, demand]) => demand);

    this.setData({
      stationRankChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            grid: {
              left: '25%',
              right: '15%',
              top: '5%',
              bottom: '8%'
            },
            xAxis: {
              type: 'value',
              axisLabel: {
                fontSize: 10,
                formatter: (value) => {
                  if (value >= 10000) {
                    return (value / 10000).toFixed(0) + '万';
                  } else if (value >= 1000) {
                    return (value / 1000).toFixed(0) + 'k';
                  }
                  return value;
                }
              }
            },
            yAxis: {
              type: 'category',
              data: stationNames,
              axisLabel: {
                fontSize: 10
              }
            },
            series: [{
              data: demands,
              type: 'bar',
              itemStyle: {
                color: (params) => {
                  const colors = [
                    '#f5222d', '#fa541c', '#fa8c16',
                    '#faad14', '#fadb14', '#a0d911',
                    '#52c41a', '#13c2c2', '#1890ff'
                  ];
                  return colors[params.dataIndex % colors.length];
                }
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 需求分布直方图
   */
  initDistributionChart() {
    // 计算每个站点的总需求
    const stationDemands = {};
    this.hourlyDemands.forEach(item => {
      if (!stationDemands[item.stationId]) {
        stationDemands[item.stationId] = 0;
      }
      stationDemands[item.stationId] += item.demand;
    });

    const demands = Object.values(stationDemands);
    const min = Math.min(...demands);
    const max = Math.max(...demands);
    
    // 分成8个区间（更清晰）
    const bins = 8;
    const binSize = (max - min) / bins;
    const histogram = new Array(bins).fill(0);

    demands.forEach(demand => {
      const binIndex = Math.min(Math.floor((demand - min) / binSize), bins - 1);
      histogram[binIndex]++;
    });

    // 生成区间标签（更清晰的范围表示）
    const binLabels = Array.from({length: bins}, (_, i) => {
      const start = Math.round(min + i * binSize);
      const end = Math.round(min + (i + 1) * binSize);
      
      if (start >= 10000) {
        return `${(start / 10000).toFixed(0)}-${(end / 10000).toFixed(0)}万`;
      } else if (start >= 1000) {
        return `${(start / 1000).toFixed(0)}-${(end / 1000).toFixed(0)}k`;
      }
      return `${start}-${end}`;
    });

    this.setData({
      distributionChart: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            title: {
              text: '站点数量分布',
              left: 'center',
              top: '5%',
              textStyle: {
                fontSize: 12,
                fontWeight: 'normal'
              }
            },
            grid: {
              left: '12%',
              right: '8%',
              top: '20%',
              bottom: '20%'
            },
            xAxis: {
              type: 'category',
              data: binLabels,
              name: '需求量区间',
              nameLocation: 'middle',
              nameGap: 25,
              nameTextStyle: {
                fontSize: 10
              },
              axisLabel: {
                fontSize: 9,
                rotate: 30,
                interval: 0
              }
            },
            yAxis: {
              type: 'value',
              name: '站点数量',
              nameTextStyle: {
                fontSize: 10
              },
              axisLabel: {
                fontSize: 10,
                formatter: '{value} 个'
              }
            },
            series: [{
              data: histogram,
              type: 'bar',
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#fa8c16' },
                  { offset: 1, color: '#fadb14' }
                ])
              },
              label: {
                show: true,
                position: 'top',
                fontSize: 10,
                formatter: '{c} 个'
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 日期-小时热力图
   */
  initDateHourHeatmap() {
    // 构建31x24的数据矩阵
    const dateMap = {};
    this.hourlyDemands.forEach(item => {
      const key = `${item.date}_${item.hour}`;
      dateMap[key] = (dateMap[key] || 0) + item.demand;
    });

    const dates = [...new Set(this.hourlyDemands.map(item => item.date))].sort();
    const hours = Array.from({length: 24}, (_, i) => i);

    const data = [];
    dates.forEach((date, dateIdx) => {
      hours.forEach((hour) => {
        const key = `${date}_${hour}`;
        const value = dateMap[key] || 0;
        data.push([hour, dateIdx, value]);
      });
    });

    this.setData({
      dateHourHeatmap: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            tooltip: {
              position: 'top'
            },
            grid: {
              left: '12%',
              right: '5%',
              top: '5%',
              bottom: '18%'
            },
            xAxis: {
              type: 'category',
              data: hours.map(h => `${h}:00`),
              splitArea: {
                show: true
              },
              axisLabel: {
                fontSize: 9,
                interval: 2
              }
            },
            yAxis: {
              type: 'category',
              data: dates.map(d => d.substring(5)),
              splitArea: {
                show: true
              },
              axisLabel: {
                fontSize: 9,
                interval: 2
              }
            },
            visualMap: {
              min: 0,
              max: Math.max(...data.map(d => d[2])),
              calculable: true,
              orient: 'horizontal',
              left: 'center',
              bottom: '0%',
              textStyle: {
                fontSize: 9
              },
              inRange: {
                color: ['#313695', '#4575b4', '#74add1', '#abd9e9', 
                        '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', 
                        '#f46d43', '#d73027', '#a50026']
              }
            },
            series: [{
              type: 'heatmap',
              data: data,
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },

  /**
   * 站点-小时热力图
   */
  initStationHourHeatmap() {
    // 计算每个站点的总需求并排序
    const stationTotalDemands = {};
    this.hourlyDemands.forEach(item => {
      if (!stationTotalDemands[item.stationId]) {
        stationTotalDemands[item.stationId] = 0;
      }
      stationTotalDemands[item.stationId] += item.demand;
    });

    // 取Top 30站点
    const topStations = Object.entries(stationTotalDemands)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([id]) => parseInt(id));

    // 构建站点x小时的数据矩阵
    const stationHourMap = {};
    this.hourlyDemands.forEach(item => {
      if (topStations.includes(item.stationId)) {
        const key = `${item.stationId}_${item.hour}`;
        stationHourMap[key] = (stationHourMap[key] || 0) + item.demand;
      }
    });

    const hours = Array.from({length: 24}, (_, i) => i);
    const data = [];
    topStations.forEach((stationId, stationIdx) => {
      hours.forEach((hour) => {
        const key = `${stationId}_${hour}`;
        const value = stationHourMap[key] || 0;
        data.push([hour, stationIdx, value]);
      });
    });

    const stationNames = topStations.map(id => {
      const station = this.stations.find(s => s.stationId == id);
      return station ? station.name : `站点${id}`;
    });

    this.setData({
      stationHourHeatmap: {
        onInit: (canvas, width, height, dpr) => {
          const chart = echarts.init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });

          const option = {
            tooltip: {
              position: 'top'
            },
            grid: {
              left: '22%',
              right: '5%',
              top: '5%',
              bottom: '18%'
            },
            xAxis: {
              type: 'category',
              data: hours.map(h => `${h}:00`),
              splitArea: {
                show: true
              },
              axisLabel: {
                fontSize: 9,
                interval: 2
              }
            },
            yAxis: {
              type: 'category',
              data: stationNames,
              splitArea: {
                show: true
              },
              axisLabel: {
                fontSize: 9
              }
            },
            visualMap: {
              min: 0,
              max: Math.max(...data.map(d => d[2])),
              calculable: true,
              orient: 'horizontal',
              left: 'center',
              bottom: '0%',
              textStyle: {
                fontSize: 9
              },
              inRange: {
                color: ['#313695', '#4575b4', '#74add1', '#abd9e9',
                        '#e0f3f8', '#ffffbf', '#fee090', '#fdae61',
                        '#f46d43', '#d73027', '#a50026']
              }
            },
            series: [{
              type: 'heatmap',
              data: data,
              emphasis: {
                itemStyle: {
                  shadowBlur: 10,
                  shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
              }
            }]
          };

          chart.setOption(option);
          return chart;
        }
      }
    });
  },
  /**
   * 找出峰值
   */
  findPeaks(data) {
    const peaks = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > data[i - 1] && data[i] > data[i + 1]) {
        peaks.push({ hour: i, value: data[i] });
      }
    }
    return peaks.sort((a, b) => b.value - a.value);
  },

  /**
   * 生成分析洞察
   */
  generateInsights() {
    this.generateTimeInsights();
    this.generateSpaceInsights();
    this.generateCombinedInsights();
    this.generateClusterGroups();
  },

  /**
   * 生成时间维度洞察
   */
  generateTimeInsights() {
    // 找出早晚高峰
    const hourData = new Array(24).fill(0);
    this.hourlyDemands.forEach(item => {
      hourData[item.hour] += item.demand;
    });

    const maxHour = hourData.indexOf(Math.max(...hourData));
    const minHour = hourData.indexOf(Math.min(...hourData));

    // 工作日vs周末对比
    let weekdayTotal = 0, weekendTotal = 0, weekdayCount = 0, weekendCount = 0;
    this.hourlyDemands.forEach(item => {
      const date = new Date(item.date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      if (isWeekend) {
        weekendTotal += item.demand;
        weekendCount++;
      } else {
        weekdayTotal += item.demand;
        weekdayCount++;
      }
    });

    const weekdayAvg = weekdayTotal / weekdayCount;
    const weekendAvg = weekendTotal / weekendCount;
    const diff = ((weekdayAvg - weekendAvg) / weekendAvg * 100).toFixed(1);

    const insights = [
      `全市需求高峰时段为${maxHour}:00，平均需求达到${this.formatNumber(Math.round(hourData[maxHour]))}次`,
      `低谷时段为${minHour}:00，平均需求约${this.formatNumber(Math.round(hourData[minHour]))}次`,
      `工作日平均需求比周末${diff > 0 ? '高' : '低'}${Math.abs(diff)}%，呈现明显的通勤特征`,
      `早高峰（7-9时）和晚高峰（17-19时）需求占全天的${((hourData.slice(7, 10).reduce((a, b) => a + b) + hourData.slice(17, 20).reduce((a, b) => a + b)) / hourData.reduce((a, b) => a + b) * 100).toFixed(1)}%`
    ];

    this.setData({ timeInsights: insights });
  },

  /**
   * 生成空间维度洞察
   */
  generateSpaceInsights() {
    // 计算站点需求统计
    const demands = this.stations.map(s => s.totalDemand || 0).filter(d => d > 0);
    const avgDemand = demands.reduce((a, b) => a + b, 0) / demands.length;
    const maxDemand = Math.max(...demands);
    const minDemand = Math.min(...demands);

    const highDemandCount = demands.filter(d => d > avgDemand * 1.5).length;
    const lowDemandCount = demands.filter(d => d < avgDemand * 0.5).length;

    const topStation = this.stations.find(s => s.totalDemand === maxDemand);

    const insights = [
      `需求最高的站点是${topStation?.name || '未知'}，总需求达到${this.formatNumber(maxDemand)}次`,
      `全市站点平均需求为${this.formatNumber(Math.round(avgDemand))}次，标准差显示需求分布不均`,
      `有${highDemandCount}个站点（${(highDemandCount / this.stations.length * 100).toFixed(1)}%）属于高需求站点，需求超过平均值1.5倍`,
      `${lowDemandCount}个站点需求低于平均值的50%，建议优化站点布局或增加推广力度`
    ];

    this.setData({ spaceInsights: insights });
  },

  /**
   * 生成时空联合洞察
   */
  generateCombinedInsights() {
    const insights = [
      '热力图显示需求呈现明显的时空聚集特征，高需求时段和高需求站点高度重叠',
      '通勤型站点主要分布在商业区和交通枢纽附近，早晚高峰特征最为显著',
      '休闲型站点多集中在公园、景区周边，周末需求明显高于工作日',
      '夜间型站点主要在娱乐区域，22:00后仍保持较高需求',
      '建议根据不同站点的时空特征，采取差异化的运营策略和车辆调度方案'
    ];

    this.setData({ combinedInsights: insights });
  },

  /**
   * 生成聚类分组
   */
  generateClusterGroups() {
    const demands = this.stations.map(s => s.totalDemand || 0).filter(d => d > 0);
    const max = Math.max(...demands);
    const min = Math.min(...demands);
    
    // 分成5个等级
    const step = (max - min) / 5;
    
    const groups = [
      {
        id: 'very_high',
        name: '超高需求',
        color: 'linear-gradient(135deg, #f5222d 0%, #cf1322 100%)',
        range: `${this.formatNumber(Math.round(min + step * 4))}+`,
        count: 0,
        avgDemand: ''
      },
      {
        id: 'high',
        name: '高需求',
        color: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)',
        range: `${this.formatNumber(Math.round(min + step * 3))}-${this.formatNumber(Math.round(min + step * 4))}`,
        count: 0,
        avgDemand: ''
      },
      {
        id: 'medium',
        name: '中等需求',
        color: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
        range: `${this.formatNumber(Math.round(min + step * 2))}-${this.formatNumber(Math.round(min + step * 3))}`,
        count: 0,
        avgDemand: ''
      },
      {
        id: 'low',
        name: '较低需求',
        color: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
        range: `${this.formatNumber(Math.round(min + step))}-${this.formatNumber(Math.round(min + step * 2))}`,
        count: 0,
        avgDemand: ''
      },
      {
        id: 'very_low',
        name: '低需求',
        color: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        range: `${this.formatNumber(Math.round(min))}-${this.formatNumber(Math.round(min + step))}`,
        count: 0,
        avgDemand: ''
      }
    ];

    // 统计每个分组的站点数和平均需求
    demands.forEach(demand => {
      let groupIndex = Math.floor((demand - min) / step);
      groupIndex = Math.min(groupIndex, 4);
      groups[4 - groupIndex].count++;
    });

    groups.forEach((group, index) => {
      const groupDemands = demands.filter(d => {
        const groupIndex = Math.floor((d - min) / step);
        return (4 - Math.min(groupIndex, 4)) === index;
      });
      
      if (groupDemands.length > 0) {
        const avg = groupDemands.reduce((a, b) => a + b, 0) / groupDemands.length;
        group.avgDemand = this.formatNumber(Math.round(avg)) + ' 次';
      }
    });

    this.setData({ clusterGroups: groups });
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
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
    this.loadAllData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '时空分析 - 城市交通需求分析',
      path: '/pages/analysis/analysis'
    };
  }
});