// miniprogram/pages/pattern-recognition/pattern-recognition.js
import * as echarts from '../../components/ec-canvas/echarts';

const app = getApp();

const CONFIG = {
  BASIC_DATA_FUNCTION: 'getBasicData',
  HOURLY_DATA_FUNCTION: 'demandService',
  DEBUG_MODE: true
};

// 模式定义
const PATTERN_TYPES = {
  COMMUTE: { name: '通勤型', color: '#1890ff', icon: '🚇' },
  LEISURE: { name: '休闲型', color: '#52c41a', icon: '🎡' },
  BALANCED: { name: '全天均衡型', color: '#faad14', icon: '⚖️' },
  NIGHT: { name: '夜间活跃型', color: '#722ed1', icon: '🌙' },
  LOW_FREQ: { name: '低频稳定型', color: '#8c8c8c', icon: '📉' }
};

let globalStationData = null;
let globalHourlyData = null;

// 全局调试计数器
let DEBUG_STEP = 0;
function debugLog(message, data) {
  DEBUG_STEP++;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[步骤 ${DEBUG_STEP}] ${message}`);
  console.log(`${'='.repeat(80)}`);
  if (data !== undefined) {
    console.log(data);
  }
}

Page({
  data: {
    clusterStats: [],
    patternTypes: PATTERN_TYPES,
    expandedPattern: null, // 当前展开的模式
    loading: true,
    // 主图表配置
    ec: { onInit: null },
    // 为每个模式准备图表配置
    ecCommute: { onInit: null },
    ecLeisure: { onInit: null },
    ecBalanced: { onInit: null },
    ecNight: { onInit: null },
    ecLowFreq: { onInit: null }
  },

  onLoad() {
    debugLog('🚀 页面加载开始 - onLoad');
    
    // 设置主图表初始化回调
    this.setData({
      ec: { onInit: this.initMainChart.bind(this) }
    });
    
    debugLog('✅ 主图表配置已设置');
    
    // 为每个模式类型设置图表初始化回调
    this.setData({
      ecCommute: { onInit: (canvas, width, height, dpr) => this.initPatternChart(canvas, width, height, dpr, 'COMMUTE') },
      ecLeisure: { onInit: (canvas, width, height, dpr) => this.initPatternChart(canvas, width, height, dpr, 'LEISURE') },
      ecBalanced: { onInit: (canvas, width, height, dpr) => this.initPatternChart(canvas, width, height, dpr, 'BALANCED') },
      ecNight: { onInit: (canvas, width, height, dpr) => this.initPatternChart(canvas, width, height, dpr, 'NIGHT') },
      ecLowFreq: { onInit: (canvas, width, height, dpr) => this.initPatternChart(canvas, width, height, dpr, 'LOW_FREQ') }
    });
    
    debugLog('✅ 模式图表配置已设置');
    
    this.loadData();
  },

  async loadData() {
    debugLog('📡 开始加载数据 - loadData 方法');
    wx.showLoading({ title: '加载中...', mask: true });
    
    try {
      // ==================== 加载站点数据 ====================
      if (!globalStationData) {
        debugLog('📞 调用云函数: getBasicData');
        
        const basicRes = await wx.cloud.callFunction({
          name: CONFIG.BASIC_DATA_FUNCTION,
          data: {}
        });
        
        debugLog('📦 getBasicData 云函数原始返回', {
          result: basicRes.result,
          errMsg: basicRes.errMsg
        });
        
        if (basicRes.result && basicRes.result.success) {
          globalStationData = basicRes.result.data.stations || [];
          
          debugLog('✅ 站点数据加载成功', {
            站点总数: globalStationData.length,
            第一个站点: globalStationData[0],
            站点字段: globalStationData.length > 0 ? Object.keys(globalStationData[0]) : [],
            前3个站点ID: globalStationData.slice(0, 3).map(s => ({
              stationId: s.stationId,
              name: s.name,
              类型: typeof s.stationId
            }))
          });
        } else {
          debugLog('❌ 站点数据加载失败', basicRes);
          throw new Error('获取站点数据失败');
        }
      } else {
        debugLog('ℹ️ 站点数据已存在，跳过加载', {
          站点数: globalStationData.length
        });
      }
      
      // ==================== 加载需求数据（从云存储下载）====================
      if (!globalHourlyData) {
        debugLog('📞 调用云函数: getHourlyDemands（云存储模式）', {
          startDate: '2021-05-01',
          endDate: '2021-05-31'
        });
        
        const hourlyRes = await wx.cloud.callFunction({
          name: CONFIG.HOURLY_DATA_FUNCTION,
          data: {
            action: 'allPaged',
            startDate: '2021-05-01',
            endDate: '2021-05-31'
          }
        });
        
        debugLog('📦 getHourlyDemands 云函数原始返回', {
          result: hourlyRes.result,
          errMsg: hourlyRes.errMsg
        });
        
        // 检查云函数是否返回了文件信息
        if (hourlyRes.result && hourlyRes.result.fileID) {
          debugLog('📁 检测到云存储文件，开始下载', {
            fileID: hourlyRes.result.fileID
          });
          
          try {
            // 下载云存储文件
            const downloadRes = await wx.cloud.downloadFile({
              fileID: hourlyRes.result.fileID
            });
            
            debugLog('📥 文件下载完成', {
              tempFilePath: downloadRes.tempFilePath,
              statusCode: downloadRes.statusCode
            });
            
            if (downloadRes.statusCode === 200) {
              // 读取文件内容
              const fileSystemManager = wx.getFileSystemManager();
              const fileContent = fileSystemManager.readFileSync(downloadRes.tempFilePath, 'utf8');
              
              debugLog('📄 文件读取完成', {
                文件大小: fileContent.length + ' 字符'
              });
              
              // 解析JSON
              globalHourlyData = JSON.parse(fileContent);
              
              debugLog('✅ 需求数据加载成功（从云存储）', {
                记录总数: globalHourlyData.length,
                第一条记录: globalHourlyData[0],
                记录字段: globalHourlyData.length > 0 ? Object.keys(globalHourlyData[0]) : [],
                前5条记录: globalHourlyData.slice(0, 5)
              });
              
              // 详细分析第一条记录
              if (globalHourlyData.length > 0) {
                const first = globalHourlyData[0];
                debugLog('🔍 第一条记录字段分析', {
                  'stationId值': first.stationId,
                  'stationId类型': typeof first.stationId,
                  'station_id值': first.station_id,
                  'station_id类型': typeof first.station_id,
                  'hour值': first.hour,
                  'hour类型': typeof first.hour,
                  'demand值': first.demand,
                  'demand类型': typeof first.demand,
                  'count值': first.count,
                  'count类型': typeof first.count,
                  'value值': first.value,
                  'value类型': typeof first.value,
                  '所有字段': first
                });
              }
              
              // 统计数据分布
              const stationIds = new Set();
              const hours = new Set();
              let demandSum = 0;
              let demandCount = 0;
              
              globalHourlyData.slice(0, 100).forEach(record => {
                stationIds.add(record.stationId || record.station_id);
                hours.add(record.hour);
                const d = record.demand || record.count || record.value || 0;
                if (d > 0) {
                  demandSum += d;
                  demandCount++;
                }
              });
              
              debugLog('📊 数据分布统计（前100条）', {
                不同站点数: stationIds.size,
                不同小时数: hours.size,
                小时范围: Array.from(hours).sort((a, b) => a - b),
                有效需求记录数: demandCount,
                平均需求: demandCount > 0 ? (demandSum / demandCount).toFixed(2) : 0
              });
            } else {
              throw new Error(`文件下载失败，状态码: ${downloadRes.statusCode}`);
            }
          } catch (downloadError) {
            debugLog('❌ 云存储文件下载或解析失败', {
              错误: downloadError.message,
              堆栈: downloadError.stack
            });
            throw new Error('下载云存储文件失败: ' + downloadError.message);
          }
        } else if (hourlyRes.result && hourlyRes.result.data) {
          // 兼容直接返回数据的情况
          debugLog('ℹ️ 检测到直接返回数据模式');
          globalHourlyData = hourlyRes.result.data;
          
          debugLog('✅ 需求数据加载成功（直接返回）', {
            记录总数: globalHourlyData.length,
            第一条记录: globalHourlyData[0]
          });
        } else {
          debugLog('❌ 云函数返回格式异常', {
            result: hourlyRes.result
          });
          throw new Error('云函数返回格式不正确，既没有 fileID 也没有 data');
        }
      } else {
        debugLog('ℹ️ 需求数据已存在，跳过加载', {
          记录数: globalHourlyData.length
        });
      }
      
      // ==================== 开始处理数据 ====================
      debugLog('🔄 开始处理模式数据');
      this.processPatternData();
      
      wx.hideLoading();
      this.setData({ loading: false });
      debugLog('✅ 数据加载完成');
      wx.showToast({ title: '识别完成', icon: 'success', duration: 1500 });
      
    } catch (error) {
      debugLog('❌ 加载失败', {
        错误信息: error.message,
        错误堆栈: error.stack,
        完整错误: error
      });
      console.error('加载失败:', error);
      wx.hideLoading();
      this.setData({ loading: false });
      wx.showModal({
        title: '加载失败',
        content: error.toString(),
        showCancel: false
      });
    }
  },

  processPatternData() {
    if (!globalStationData || !globalHourlyData) {
      debugLog('❌ 数据不完整，无法处理', {
        globalStationData存在: !!globalStationData,
        globalHourlyData存在: !!globalHourlyData
      });
      return;
    }
    
    debugLog('🔄 开始处理模式数据 - processPatternData', {
      站点总数: globalStationData.length,
      需求记录总数: globalHourlyData.length
    });
    
    console.log('=== 方案C：分层聚类模式识别 ===');
    
    // 获取所有站点的24小时曲线和总需求
    const stationsWithData = globalStationData.map((station, index) => {
      if (index < 3) {
        console.log(`\n  处理站点 ${index + 1}/${globalStationData.length}: ${station.name}`);
      }
      
      const hourlyProfile = this.getStationHourlyProfile(station.stationId);
      const totalDemand = hourlyProfile.reduce((sum, v) => sum + v, 0) * 31; // 月总需求
      const features = this.analyzeFeatures(hourlyProfile);
      
      if (index < 3) {
        console.log(`  ✅ 站点 ${index + 1} 数据:`, {
          name: station.name,
          hourlyProfile前5个: hourlyProfile.slice(0, 5).map(v => v.toFixed(4)),
          hourlyProfile总和: hourlyProfile.reduce((sum, v) => sum + v, 0).toFixed(2),
          totalDemand: totalDemand.toFixed(2),
          features: features
        });
      }
      
      return {
        ...station,
        hourlyProfile: hourlyProfile,
        totalDemand: totalDemand,
        features: features
      };
    });
    
    debugLog('✅ 所有站点数据处理完成', {
      站点总数: stationsWithData.length,
      前3个站点总需求: stationsWithData.slice(0, 3).map(s => ({
        name: s.name,
        totalDemand: s.totalDemand.toFixed(2),
        profileSum: s.hourlyProfile.reduce((a, b) => a + b, 0).toFixed(2)
      }))
    });
    
    // 方案C：分层分类
    const classified = this.hierarchicalClassification(stationsWithData);
    
    debugLog('✅ 分类完成', {
      分类站点总数: classified.length,
      前3个分类站点: classified.slice(0, 3).map(s => ({
        name: s.name,
        pattern: s.pattern,
        patternName: s.patternName,
        hourlyProfile前3个: s.hourlyProfile.slice(0, 3).map(v => v.toFixed(4))
      }))
    });
    
    // 统计结果
    const clusterStats = this.calculateClusterStats(classified);
    
    debugLog('✅ 统计完成', {
      模式数量: clusterStats.length,
      各模式站点数: clusterStats.map(s => ({
        name: s.name,
        count: s.count,
        color: s.color
      }))
    });
    
    console.log('=== 分类完成 ===');
    clusterStats.forEach(stat => {
      console.log(`${stat.name}: ${stat.count}个站点 (${stat.widthPercent})`);
      if (CONFIG.DEBUG_MODE) {
        console.log(`  特征: ${stat.features}`);
      }
    });
    
    this.setData({ clusterStats });
    
    debugLog('📊 clusterStats 已设置到页面数据');
    
    // 更新主图表
    setTimeout(() => {
      debugLog('⏰ 延迟300ms后开始更新主图表');
      this.updateMainChart();
    }, 300);
  },

  // 方案C：分层分类
  hierarchicalClassification(stations) {
    // 按总需求量排序
    const sorted = [...stations].sort((a, b) => b.totalDemand - a.totalDemand);
    
    console.log('总需求量范围:', {
      最高: sorted[0].totalDemand.toFixed(0),
      最低: sorted[sorted.length - 1].totalDemand.toFixed(0)
    });
    
    // 第1层：识别低频稳定型（总需求最低的10个）
    const lowFreqStations = sorted.slice(-10).map(s => ({
      ...s,
      pattern: 'LOW_FREQ',
      patternName: PATTERN_TYPES.LOW_FREQ.name,
      patternColor: PATTERN_TYPES.LOW_FREQ.color,
      patternIcon: PATTERN_TYPES.LOW_FREQ.icon,
      reason: '总需求量最低'
    }));
    
    console.log(`✓ 低频稳定型: 10个站点（总需求最低）`);
    
    // 第2层：识别夜间活跃型（夜间占比最高的8个）
    const remaining = sorted.slice(0, -10);
    const sortedByNight = [...remaining].sort((a, b) => 
      b.features.nightRatio - a.features.nightRatio
    );
    
    const nightStations = sortedByNight.slice(0, 8).map(s => ({
      ...s,
      pattern: 'NIGHT',
      patternName: PATTERN_TYPES.NIGHT.name,
      patternColor: PATTERN_TYPES.NIGHT.color,
      patternIcon: PATTERN_TYPES.NIGHT.icon,
      reason: `夜间占比${(s.features.nightRatio * 100).toFixed(1)}%`
    }));
    
    console.log(`✓ 夜间活跃型: 8个站点（夜间占比最高）`);
    
    // 第3层：剩余32个站点，根据峰值特征分为3类
    const remaining32 = remaining.filter(s => 
      !nightStations.find(n => n.stationId === s.stationId)
    );
    
    // 通勤型：早晚双峰明显（早高峰+晚高峰评分最高的12个）
    const sortedByCommute = [...remaining32].sort((a, b) => {
      const scoreA = a.features.morningRatio + a.features.eveningRatio;
      const scoreB = b.features.morningRatio + b.features.eveningRatio;
      return scoreB - scoreA;
    });
    
    const commuteStations = sortedByCommute.slice(0, 12).map(s => ({
      ...s,
      pattern: 'COMMUTE',
      patternName: PATTERN_TYPES.COMMUTE.name,
      patternColor: PATTERN_TYPES.COMMUTE.color,
      patternIcon: PATTERN_TYPES.COMMUTE.icon,
      reason: '早晚双峰明显'
    }));
    
    console.log(`✓ 通勤型: 12个站点（早晚峰评分最高）`);
    
    // 休闲型：午后峰值明显（午后评分最高的10个）
    const remaining20 = remaining32.filter(s =>
      !commuteStations.find(c => c.stationId === s.stationId)
    );
    
    const sortedByAfternoon = [...remaining20].sort((a, b) =>
      b.features.afternoonRatio - a.features.afternoonRatio
    );
    
    const leisureStations = sortedByAfternoon.slice(0, 10).map(s => ({
      ...s,
      pattern: 'LEISURE',
      patternName: PATTERN_TYPES.LEISURE.name,
      patternColor: PATTERN_TYPES.LEISURE.color,
      patternIcon: PATTERN_TYPES.LEISURE.icon,
      reason: '午后峰值明显'
    }));
    
    console.log(`✓ 休闲型: 10个站点（午后峰评分最高）`);
    
    // 全天均衡型：剩余的10个
    const balancedStations = remaining20
      .filter(s => !leisureStations.find(l => l.stationId === s.stationId))
      .map(s => ({
        ...s,
        pattern: 'BALANCED',
        patternName: PATTERN_TYPES.BALANCED.name,
        patternColor: PATTERN_TYPES.BALANCED.color,
        patternIcon: PATTERN_TYPES.BALANCED.icon,
        reason: '需求相对均衡'
      }));
    
    console.log(`✓ 全天均衡型: ${balancedStations.length}个站点（剩余站点）`);
    
    // 合并所有分类结果
    return [
      ...commuteStations,
      ...leisureStations,
      ...balancedStations,
      ...nightStations,
      ...lowFreqStations
    ];
  },

  // 获取站点的24小时需求曲线
  getStationHourlyProfile(stationId) {
    if (!this._profileDebugCount) {
      this._profileDebugCount = 0;
    }
    this._profileDebugCount++;
    
    const profile = new Array(24).fill(0);
    
    // 只对前3个站点进行详细调试
    const shouldDebug = this._profileDebugCount <= 3;
    
    if (shouldDebug) {
      debugLog(`📊 获取站点 #${this._profileDebugCount} 的hourlyProfile`, {
        站点ID: stationId,
        站点ID类型: typeof stationId,
        globalHourlyData存在: !!globalHourlyData,
        globalHourlyData长度: globalHourlyData?.length
      });
    }
    
    let matchCount = 0;
    let totalDemand = 0;
    const matchedRecords = [];
    
    globalHourlyData.forEach((record, index) => {
      // 尝试不同的匹配方式
      const strictMatch = record.stationId === stationId;
      const looseMatch = record.stationId == stationId;
      const underscoreMatch = record.station_id === stationId;
      
      const isMatch = strictMatch || looseMatch || underscoreMatch;
      
      if (isMatch) {
        const hour = parseInt(record.hour);
        const demand = record.demand || record.count || record.value || 0;
        
        if (shouldDebug && matchCount < 5) {
          console.log(`  ✅ 匹配 #${matchCount + 1}:`, {
            记录索引: index,
            stationId: record.stationId,
            station_id: record.station_id,
            hour: hour,
            原始hour: record.hour,
            demand: demand,
            原始demand: record.demand,
            原始count: record.count,
            匹配方式: strictMatch ? '严格匹配' : underscoreMatch ? 'station_id' : '宽松匹配'
          });
        }
        
        if (hour >= 0 && hour < 24) {
          profile[hour] += demand;
          totalDemand += demand;
        } else if (shouldDebug) {
          console.warn(`  ⚠️ 异常hour值: ${hour}`, record);
        }
        
        matchCount++;
        if (matchCount <= 3) {
          matchedRecords.push(record);
        }
      }
    });
    
    if (shouldDebug) {
      debugLog(`📈 站点 #${this._profileDebugCount} 匹配结果`, {
        站点ID: stationId,
        匹配记录数: matchCount,
        应有记录数: '31天 × 24小时 = 744条',
        总需求量: totalDemand.toFixed(2),
        前3条匹配记录: matchedRecords,
        原始profile前5个值: profile.slice(0, 5).map(v => v.toFixed(2)),
        原始profile总和: profile.reduce((sum, v) => sum + v, 0).toFixed(2),
        原始profile最大值: Math.max(...profile).toFixed(2),
        原始profile非零小时数: profile.filter(v => v > 0).length
      });
      
      if (matchCount === 0) {
        debugLog('❌ 未匹配到任何记录，尝试诊断', {
          '查询ID': stationId,
          '查询ID类型': typeof stationId,
          '数据中的前5个stationId': globalHourlyData.slice(0, 5).map(r => ({
            stationId: r.stationId,
            类型: typeof r.stationId,
            station_id: r.station_id,
            类型2: typeof r.station_id
          }))
        });
      }
    }
    
    // 计算平均值（31天）
    const avgProfile = profile.map(v => v / 31);
    
    if (shouldDebug) {
      debugLog(`📉 站点 #${this._profileDebugCount} 平均化结果`, {
        平均profile前5个值: avgProfile.slice(0, 5).map(v => v.toFixed(4)),
        平均profile总和: avgProfile.reduce((sum, v) => sum + v, 0).toFixed(2),
        平均profile最大值: Math.max(...avgProfile).toFixed(2),
        平均profile非零小时数: avgProfile.filter(v => v > 0).length
      });
    }
    
    return avgProfile;
  },

  // 分析站点特征
  analyzeFeatures(hourlyProfile) {
    const total = hourlyProfile.reduce((sum, v) => sum + v, 0);
    const avg = total / 24;
    
    if (avg === 0) {
      return {
        morningRatio: 0,
        eveningRatio: 0,
        afternoonRatio: 0,
        nightRatio: 0,
        cv: 0
      };
    }
    
    // 关键时段平均值
    const morning = this.getAverage(hourlyProfile, 7, 9);      // 早高峰
    const evening = this.getAverage(hourlyProfile, 17, 19);    // 晚高峰
    const afternoon = this.getAverage(hourlyProfile, 14, 17);  // 午后
    const night = this.getAverage(hourlyProfile, 22, 24) + 
                  this.getAverage(hourlyProfile, 0, 6);        // 夜间
    
    // 计算变异系数
    const variance = hourlyProfile.reduce((sum, v) => 
      sum + Math.pow(v - avg, 2), 0) / 24;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / avg;
    
    return {
      morningRatio: morning / avg,
      eveningRatio: evening / avg,
      afternoonRatio: afternoon / avg,
      nightRatio: night / total,
      cv: cv,
      morning: morning,
      evening: evening,
      afternoon: afternoon,
      night: night
    };
  },

  // 计算指定时段的平均值
  getAverage(array, start, end) {
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      sum += array[i % 24];
      count++;
    }
    return count > 0 ? sum / count : 0;
  },

  // 格式化特征描述
  formatFeatures(pattern, stations) {
    if (stations.length === 0) return '';
    
    const avgFeatures = {
      morningRatio: 0,
      eveningRatio: 0,
      afternoonRatio: 0,
      nightRatio: 0
    };
    
    stations.forEach(s => {
      avgFeatures.morningRatio += s.features.morningRatio;
      avgFeatures.eveningRatio += s.features.eveningRatio;
      avgFeatures.afternoonRatio += s.features.afternoonRatio;
      avgFeatures.nightRatio += s.features.nightRatio;
    });
    
    const n = stations.length;
    avgFeatures.morningRatio /= n;
    avgFeatures.eveningRatio /= n;
    avgFeatures.afternoonRatio /= n;
    avgFeatures.nightRatio /= n;
    
    const parts = [];
    
    switch(pattern) {
      case 'COMMUTE':
        if (avgFeatures.morningRatio > 1.0) parts.push('早高峰');
        if (avgFeatures.eveningRatio > 1.0) parts.push('晚高峰');
        break;
      case 'LEISURE':
        if (avgFeatures.afternoonRatio > 1.0) parts.push('午后峰');
        break;
      case 'NIGHT':
        parts.push(`夜间占比${(avgFeatures.nightRatio * 100).toFixed(1)}%`);
        break;
      case 'LOW_FREQ':
        parts.push('低需求', '稳定');
        break;
      case 'BALANCED':
        parts.push('全天均衡');
        break;
    }
    
    return parts.join(', ') || '特征分析中';
  },

  // 统计聚类信息
  calculateClusterStats(stations) {
    const stats = [];
    
    Object.keys(PATTERN_TYPES).forEach(typeKey => {
      const stationsInPattern = stations.filter(s => s.pattern === typeKey);
      const patternInfo = PATTERN_TYPES[typeKey];
      
      stats.push({
        type: typeKey,
        name: patternInfo.name,
        color: patternInfo.color,
        icon: patternInfo.icon,
        count: stationsInPattern.length,
        widthPercent: `${(stationsInPattern.length / 50 * 100).toFixed(1)}%`,
        stations: stationsInPattern,
        features: this.formatFeatures(typeKey, stationsInPattern),
        typicalCurve: this.calculateTypicalCurve(stationsInPattern)
      });
    });
    
    // 按站点数量排序
    stats.sort((a, b) => b.count - a.count);
    
    return stats;
  },

  // 计算典型曲线
  calculateTypicalCurve(stations) {
    if (stations.length === 0) return new Array(24).fill(0);
    
    const curve = new Array(24).fill(0);
    stations.forEach(station => {
      station.hourlyProfile.forEach((value, hour) => {
        curve[hour] += value;
      });
    });
    
    // 归一化到0-100
    const max = Math.max(...curve);
    return max > 0 ? curve.map(v => (v / max) * 100) : curve;
  },

  // 初始化主图表
  initMainChart(canvas, width, height, dpr) {
    const query = wx.createSelectorQuery();
    query.select('#pattern-chart').boundingClientRect();
    query.exec(res => {
      if (!res || !res[0]) {
        console.log('未找到主图表容器');
        return;
      }
      
      const containerWidth = res[0].width;
      console.log('主图表容器宽度:', containerWidth);
      
      const chart = echarts.init(canvas, null, {
        width: containerWidth,
        height: height,
        devicePixelRatio: dpr
      });
      
      canvas.setChart(chart);
      this.mainChart = chart;
      
      console.log('主图表初始化完成');
    });
    
    return null;
  },

  // 更新主图表 - 显示所有模式的平均需求曲线
  updateMainChart() {
    debugLog('🎨 开始更新主图表 - updateMainChart');
    
    if (!this.mainChart) {
      debugLog('❌ 主图表未初始化');
      return;
    }
    
    if (!this.data.clusterStats || this.data.clusterStats.length === 0) {
      debugLog('❌ clusterStats 数据为空');
      return;
    }
    
    debugLog('📊 检查 clusterStats 数据', {
      模式数量: this.data.clusterStats.length,
      各模式概况: this.data.clusterStats.map((c, i) => ({
        序号: i + 1,
        name: c.name,
        count: c.count,
        stations长度: c.stations?.length,
        第一个站点: c.stations?.[0]?.name,
        第一个站点有hourlyProfile: !!c.stations?.[0]?.hourlyProfile
      }))
    });
    
    const series = [];
    let globalMax = 0;
    let processedCount = 0;
    
    // 为每个模式添加一条平均曲线
    this.data.clusterStats.forEach((cluster, clusterIndex) => {
      debugLog(`🔄 处理模式 ${clusterIndex + 1}/${this.data.clusterStats.length}: ${cluster.name}`, {
        颜色: cluster.color,
        站点数: cluster.count,
        stations存在: !!cluster.stations,
        stations长度: cluster.stations?.length
      });
      
      if (cluster.count === 0 || !cluster.stations || cluster.stations.length === 0) {
        console.log(`  ⚠️ 跳过 ${cluster.name}，无站点数据`);
        return;
      }
      
      // 检查前2个站点
      console.log(`  🔍 检查前2个站点的数据:`);
      cluster.stations.slice(0, 2).forEach((station, si) => {
        console.log(`    站点 ${si + 1}: ${station.name}`, {
          hourlyProfile存在: !!station.hourlyProfile,
          hourlyProfile是数组: Array.isArray(station.hourlyProfile),
          hourlyProfile长度: station.hourlyProfile?.length,
          hourlyProfile前3个值: station.hourlyProfile?.slice(0, 3).map(v => v.toFixed(4)),
          hourlyProfile总和: station.hourlyProfile?.reduce((a, b) => a + b, 0).toFixed(2)
        });
      });
      
      // 计算该模式的平均曲线
      const avgCurve = new Array(24).fill(0);
      let validStationCount = 0;
      
      cluster.stations.forEach((station, si) => {
        if (station.hourlyProfile && Array.isArray(station.hourlyProfile) && station.hourlyProfile.length === 24) {
          station.hourlyProfile.forEach((value, hour) => {
            avgCurve[hour] += value;
          });
          validStationCount++;
          
          if (si < 2) {
            console.log(`    ✅ 站点 ${si + 1} (${station.name}) 数据已累加`);
          }
        } else {
          if (si < 2) {
            console.log(`    ❌ 站点 ${si + 1} (${station.name}) hourlyProfile 无效`, {
              exists: !!station.hourlyProfile,
              isArray: Array.isArray(station.hourlyProfile),
              length: station.hourlyProfile?.length
            });
          }
        }
      });
      
      console.log(`  📊 累加结果:`, {
        有效站点数: validStationCount,
        累加后前5个值: avgCurve.slice(0, 5).map(v => v.toFixed(2)),
        累加后总和: avgCurve.reduce((a, b) => a + b, 0).toFixed(2),
        累加后最大值: Math.max(...avgCurve).toFixed(2)
      });
      
      // 计算平均值
      if (validStationCount > 0) {
        avgCurve.forEach((value, index) => {
          avgCurve[index] = value / validStationCount;
        });
        
        console.log(`  📉 平均化结果:`, {
          平均后前5个值: avgCurve.slice(0, 5).map(v => v.toFixed(4)),
          平均后总和: avgCurve.reduce((a, b) => a + b, 0).toFixed(2),
          平均后最大值: Math.max(...avgCurve).toFixed(2)
        });
      } else {
        debugLog(`⚠️ ${cluster.name} 没有有效站点数据，跳过`);
        return;
      }
      
      const curveMax = Math.max(...avgCurve);
      const curveMin = Math.min(...avgCurve);
      globalMax = Math.max(globalMax, curveMax);
      
      console.log(`  ✅ ${cluster.name} 完成:`, {
        min: curveMin.toFixed(4),
        max: curveMax.toFixed(4),
        average: (avgCurve.reduce((a, b) => a + b, 0) / 24).toFixed(4)
      });
      
      series.push({
        name: cluster.name,
        type: 'line',
        data: avgCurve,
        smooth: true,
        lineStyle: {
          width: 3,
          color: cluster.color
        },
        itemStyle: {
          color: cluster.color
        },
        symbol: 'circle',
        symbolSize: 6,
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 4
          }
        }
      });
      
      processedCount++;
    });
    
    debugLog('📈 系列数据准备完成', {
      处理的模式数: processedCount,
      系列数量: series.length,
      全局最大值: globalMax.toFixed(4),
      各系列数据总和: series.map(s => ({
        name: s.name,
        dataSum: s.data.reduce((a, b) => a + b, 0).toFixed(2),
        dataMax: Math.max(...s.data).toFixed(4),
        前5个值: s.data.slice(0, 5).map(v => v.toFixed(4))
      }))
    });
    
    const option = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        textStyle: {
          color: '#262626',
          fontSize: 11
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: '#8c8c8c',
            type: 'dashed'
          }
        },
        formatter: params => {
          const hour = params[0].axisValue;
          let content = `<div style="font-weight: bold; margin-bottom: 8px;">${hour}:00</div>`;
          
          params.forEach(param => {
            content += `<div style="margin: 4px 0;">
              ${param.marker} ${param.seriesName}: <strong>${param.value.toFixed(1)}</strong>次
            </div>`;
          });
          
          return content;
        }
      },
      legend: {
        data: this.data.clusterStats.filter(c => c.count > 0).map(c => c.name),
        top: 10,
        left: 'center',
        textStyle: {
          fontSize: 11,
          color: '#595959'
        },
        itemWidth: 18,
        itemHeight: 10,
        itemGap: 10
      },
      grid: {
        // 增大上边距给图例留出空间
        top: 120,
        left: '12%',
        right: '6%',
        bottom: 60,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        name: '小时',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: {
          fontSize: 12,
          color: '#595959'
        },
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          interval: 2
        },
        axisLine: {
          lineStyle: {
            color: '#e0e0e0'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '平均需求量',
        // 将 Y 轴整体右移，避免与图例遮挡
        offset: 16,
        nameTextStyle: {
          fontSize: 12,
          color: '#595959'
        },
        min: 0,
        max: globalMax > 0 ? Math.ceil(globalMax * 1.15) : 100,
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          formatter: value => {
            if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
            return value.toFixed(0);
          }
        },
        splitLine: {
          lineStyle: {
            color: '#f0f0f0',
            type: 'dashed'
          }
        },
        axisLine: {
          show: false
        }
      },
      series: series
    };
    
    debugLog('🎨 准备设置图表选项', {
      option配置: {
        有tooltip: !!option.tooltip,
        有legend: !!option.legend,
        有grid: !!option.grid,
        有xAxis: !!option.xAxis,
        有yAxis: !!option.yAxis,
        系列数量: option.series?.length,
        Y轴最大值: option.yAxis?.max
      }
    });
    
    debugLog('📊 即将调用 setOption', {
      图表实例存在: !!this.mainChart,
      系列数据: series.map(s => ({
        name: s.name,
        数据点数: s.data.length,
        数据总和: s.data.reduce((a, b) => a + b, 0).toFixed(2),
        数据最大值: Math.max(...s.data).toFixed(4)
      }))
    });
    
    this.mainChart.setOption(option, true);
    
    debugLog('✅ 主图表更新完成！', {
      处理的系列数: series.length,
      最终globalMax: globalMax.toFixed(4)
    });
  },

  // 初始化图表（为每个模式类型创建独立的图表实例）
  initPatternChart(canvas, width, height, dpr, patternType) {
    console.log(`初始化${patternType}图表, width: ${width}, height: ${height}`);
    
    // 计算正确的容器宽度（参考station-detail.js）
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const rpxToPx = screenWidth / 750;
    const pageHorizontalPadding = 40; // 页面左右padding总和
    const containerWidth = screenWidth - (pageHorizontalPadding * rpxToPx);
    
    const chart = echarts.init(canvas, null, {
      width: containerWidth,
      height: height,
      devicePixelRatio: dpr
    });
    
    canvas.setChart(chart);
    
    // 保存图表实例
    if (!this.charts) {
      this.charts = {};
    }
    this.charts[patternType] = chart;
    
    // 延迟调整确保正确
    setTimeout(() => {
      if (this.charts[patternType]) {
        this.charts[patternType].resize({
          width: containerWidth,
          height: height
        });
      }
    }, 100);
    
    return chart;
  },

  // 更新指定模式的图表
  updatePatternChart(patternType) {
    const chart = this.charts && this.charts[patternType];
    if (!chart) {
      console.log(`图表${patternType}未初始化`);
      return;
    }
    
    const cluster = this.data.clusterStats.find(c => c.type === patternType);
    if (!cluster || cluster.count === 0) {
      console.log(`模式${patternType}无数据`);
      return;
    }
    
    console.log(`更新${patternType}图表, 站点数: ${cluster.stations.length}`);
    
    // 准备系列数据：每个站点一条线 + 平均线
    const series = [];
    
    // 计算所有数据的最大值和最小值，用于确定Y轴范围
    let globalMax = 0;
    let globalMin = Infinity;
    
    // 添加每个站点的曲线
    cluster.stations.forEach((station, index) => {
      const stationMax = Math.max(...station.hourlyProfile);
      const stationMin = Math.min(...station.hourlyProfile);
      globalMax = Math.max(globalMax, stationMax);
      globalMin = Math.min(globalMin, stationMin);
      
      series.push({
        name: station.name,
        type: 'line',
        data: station.hourlyProfile,
        smooth: true,
        lineStyle: {
          width: 1.5,
          opacity: 0.4,
          color: cluster.color
        },
        itemStyle: {
          opacity: 0
        },
        symbol: 'none',  // 不显示数据点
        emphasis: {
          disabled: true  // 禁用高亮效果
        },
        silent: true  // 禁用鼠标事件
      });
    });
    
    // 计算并添加平均曲线
    const avgCurve = new Array(24).fill(0);
    cluster.stations.forEach(station => {
      station.hourlyProfile.forEach((value, hour) => {
        avgCurve[hour] += value;
      });
    });
    avgCurve.forEach((value, index) => {
      avgCurve[index] = value / cluster.stations.length;
    });
    
    const avgMax = Math.max(...avgCurve);
    const avgMin = Math.min(...avgCurve);
    globalMax = Math.max(globalMax, avgMax);
    globalMin = Math.min(globalMin, avgMin);
    
    console.log(`数据范围: min=${globalMin.toFixed(2)}, max=${globalMax.toFixed(2)}`);
    
    series.push({
      name: '平均需求',
      type: 'line',
      data: avgCurve,
      smooth: true,
      lineStyle: {
        width: 3,
        color: cluster.color
      },
      itemStyle: {
        color: cluster.color
      },
      symbol: 'none',  // 不显示数据点标记
      emphasis: {
        focus: 'series',
        lineStyle: {
          width: 4
        }
      },
      z: 10 // 置于最上层
    });
    
    const option = {
      title: {
        text: `${cluster.icon} ${cluster.name} - 需求曲线`,
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold',
          color: '#262626'
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        textStyle: {
          color: '#262626',
          fontSize: 11
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: cluster.color,
            type: 'dashed'
          }
        },
        formatter: params => {
          const hour = params[0].axisValue;
          let content = `<div style="font-weight: bold; margin-bottom: 6px;">${hour}:00</div>`;
          
          // 找到平均需求的数据
          const avgParam = params.find(p => p.seriesName === '平均需求');
          if (avgParam) {
            content += `<div style="margin: 2px 0; font-weight: bold; color: ${cluster.color};">
              ${avgParam.marker} ${avgParam.seriesName}: ${avgParam.value.toFixed(1)}次
            </div>`;
          }
          
          return content;
        }
      },
      legend: {
        show: false // 站点太多，隐藏图例
      },
      grid: {
        top: 50,
        left: '15%',
        right: '8%',
        bottom: 40,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => i),
        name: '小时',
        nameTextStyle: {
          fontSize: 11,
          color: '#595959'
        },
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          interval: 2
        },
        axisLine: {
          lineStyle: {
            color: '#e0e0e0'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '需求量',
        nameTextStyle: {
          fontSize: 11,
          color: '#595959'
        },
        min: 0,  // 强制从0开始
        max: globalMax > 0 ? Math.ceil(globalMax * 1.1) : 100,  // 最大值增加10%
        axisLabel: {
          fontSize: 10,
          color: '#8c8c8c',
          formatter: value => {
            if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
            return value.toFixed(0);
          }
        },
        splitLine: {
          lineStyle: {
            color: '#f0f0f0',
            type: 'dashed'
          }
        },
        axisLine: {
          show: false
        }
      },
      series: series
    };
    
    chart.setOption(option, true);
    console.log(`${patternType}图表更新完成`);
  },

  // 切换模式展开状态
  togglePatternExpand(e) {
    const type = e.currentTarget.dataset.type;
    const cluster = this.data.clusterStats.find(c => c.type === type);
    
    if (!cluster || cluster.count === 0) {
      wx.showToast({ title: '该模式暂无站点', icon: 'none' });
      return;
    }
    
    // 切换展开状态
    const newExpandedPattern = this.data.expandedPattern === type ? null : type;
    
    this.setData({
      expandedPattern: newExpandedPattern
    }, () => {
      // 如果是展开状态，延迟更新图表
      if (newExpandedPattern === type) {
        setTimeout(() => {
          this.updatePatternChart(type);
        }, 300);
      }
    });
  },

  // 查看模式详情（保留原有的弹窗功能）
  viewClusterDetail(e) {
    const type = e.currentTarget.dataset.type;
    const cluster = this.data.clusterStats.find(c => c.type === type);
    
    if (!cluster || cluster.count === 0) {
      wx.showToast({ title: '该模式暂无站点', icon: 'none' });
      return;
    }
    
    const stationNames = cluster.stations.map(s => `${s.name}`).join('\n');
    wx.showModal({
      title: `${cluster.icon} ${cluster.name}`,
      content: `共${cluster.count}个站点:\n特征: ${cluster.features}\n\n${stationNames}`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onShow() {
    if (globalStationData && globalHourlyData) {
      this.processPatternData();
    }
  },

  onPullDownRefresh() {
    globalStationData = null;
    globalHourlyData = null;
    this.loadData().then(() => wx.stopPullDownRefresh());
  }
});