import { LAMPORTS_PER_SOL,Commitment } from "@solana/web3.js";

export const normalConfig = { // 一般配置
    loggerLevel: "debug", // 日志级别
    commitment: "confirmed" as Commitment, // 交易确认级别
    showWaitAndNextRound: false, // 是否显示等待和下一轮
    waitTimePerRound: 0.35 * 1000, // 每一轮间隔时间
    txMutilpler : 2, // 当发现套利机会时提出交易的次数
    maxAddressLookupTableNum: 200, // 保存最大地址查找表数量
    directRoute: true, // 是否直接路由
    tradePercentageOfBalance: 0.98, // 交易百分比
    maxTolerantSlotNum: 3, // 最大可接受的报价contextSlot与latestSlot的差距
    maxTolerantSlotDiffNum: 3, // 最大可接受的两个报价的contextSlot的差距
    partformFeeBps: 0, // 平台手续费,单位为0.01%
    minProfitBps: 20, // 最小利润，单位为0.01%
    minJitoTip: 0.0001 * LAMPORTS_PER_SOL, // 最小jito tip
    jitoFeePercentage: 0.2, // jito手续费百分比
    computeUnitBudget: 199999, // 计算单元预算
};

export const submitTxMethodConfig = { // 提交交易方法配置
    ifsendTxByJito: true, // 是否通过jito发送交易
    sendMethodByJito: "Bundle", // 发送交易的方法,有Jito和Bundle两种
    ifsendTxToBothRpcAndJito: true, // 是否将交易同时发送到rpc和bundle,如果为true,ifsendTxToByJito必须为true
};

export const judgementConfig = { // 判断条件配置
    ifJudgeSamePool: true, // 是否判断是否为同一个池子
    ifJudgeSlotLatency: false, // 是否判断slot延迟，如果是则需要设置 maxTolerantSlotNum
    ifJudgeSlotDiffOfQuotes:false, // 是否判断两个报价的contextSlot的差距，如果是则需要设置 maxTolerantSlotDiffNum
};

export const priorityFeeConfig = { // 每个优先级的最大费用，单位为microLamport
    maxFeeOfExtreme: 45678,
    maxFeeOfHigh: 34567,
    maxFeeOfMedium: 23456,
    maxFeeOfLow: 12345
};
export const priorityFeeLevelThreshold = { // 优先级阈值
    extreme: 0.05,
    high: 0.02,
    medium: 0.01,
    low: 0,
};

export const IntervalConfig = { // 间隔时间配置
    priorityFeeInterval: 1000 * 30, // 优先费间隔时间
    balanceInterval: 1000 * 60 * 5, // 余额间隔时间
    blockhashInterval: 1000 * 10, // blockhash间隔时间
    getSlotInterval: 1000 * 10, // 从链上获取slot间隔时间
    updateSlotInterval: 420, // 更新slot间隔时间
    reconnectWsInterval: 1000 * 30, // 重连ws间隔时间
    wsPingInterval: 1000 * 10, // ws心跳间隔时间
    wsReloadInterval: 1000 * 60 * 30, // ws重新加载间隔时间，防止ws错误时程序停止运行
    adjustAddressLookupTableInterval: 1000 * 3, // 调整地址查找表间隔时间,每次调整一个，所以时间间隔不宜过长
    updateTradePairsInterval: 1000 * 60 * 5, // 更新交易对间隔时间
}

export const JitoTipAccounts = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
]

export const BundleApis = [
    "https://frankfurt.mainnet.block-engine.jito.wtf",
    "https://mainnet.block-engine.jito.wtf",
    "https://ny.mainnet.block-engine.jito.wtf",
    "https://tokyo.mainnet.block-engine.jito.wtf",
]

export interface TradePair {
    symbol: string;
    mint: string;
}
export const trade_pairs = {
    pair1: {symbol: "wsol", mint: "So11111111111111111111111111111111111111112"},
    pair2s: [
        
    ] as TradePair[], //如果添加，则不会自动更新币对
    timeSpan: "24h", //只能是 1m 5m 1h 6h 24h
    startNum: 0, // 从第几个币对开始
    pairNum: 5,
}