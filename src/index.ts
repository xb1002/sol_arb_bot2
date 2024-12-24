import { Connection,PublicKey,Keypair,AddressLookupTableAccount,TransactionInstruction,
    ComputeBudgetProgram,SystemProgram,TransactionMessage,VersionedTransaction
 } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { DefaultApi,QuoteGetRequest,QuoteGetSwapModeEnum,QuoteResponse,
    SwapRequest,createJupiterApiClient
 } from "@jup-ag/api";
import "dotenv/config";
import * as config from "./config.js";
import * as lib from "./lib.js";
import winston from "winston";
import bs58 from "bs58";
import WebSocket from 'ws';
import os from 'os';

// -------------------------------------------------
// 日志配置
const logger = winston.createLogger({
    level: "info",
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console({level: "debug"}), // 控制台输出
        new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
        }),
        new winston.transports.File({ filename: "logs/combined.log" }),
    ],
});
const tradeLogger = winston.createLogger({
    level: "info",
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/trade.log" }),
    ],
});

// -------------------------------------------------
// 读取环境变量
const RPC = process.env.RPC as string;
const sendTxRpcs = process.env.SEND_TX_RPCS as string;
const jupiterApi = process.env.JUPITER_API as string;
const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(process.env.SECRET_KEY as string)));

// 准备
const commitment = config.normalConfig.commitment;
const pubRPC = "https://api.mainnet-beta.solana.com";
const con = new Connection(RPC, commitment);
const sendTxCons = sendTxRpcs.split(",").map((rpc) => new Connection(rpc, commitment));
const pubCon = new Connection(pubRPC, commitment);
const jupCon = createJupiterApiClient({basePath:jupiterApi});

// -------------------------------------------------
// 按规定时间更新余额-->使用pubCon
let {symbol:mainSymbol,mint:mainMint} = config.trade_pairs.pair1;
var mainBalance = 0;
let ATA = await getAssociatedTokenAddress(new PublicKey(mainMint),payer.publicKey);
mainBalance = await lib.getMainBalance(ATA,pubCon);
logger.debug(`mainBalance: ${mainBalance}`)
setInterval(() => {
    lib.getMainBalance(ATA,pubCon).then((res) => {
        mainBalance = res;
    }).catch((error) => {
        logger.error(`get balance error: ${error}`);
    });
}, config.IntervalConfig.balanceInterval);


// -------------------------------------------------
// 按规定时间更新blockhash-->使用pubCon
var blockhash_list:string[] = [];
var blockhash = (await pubCon.getLatestBlockhash()).blockhash;
blockhash_list.push(blockhash);
setInterval(() => {
    pubCon.getLatestBlockhash().then((res) => {
        blockhash = res.blockhash;
        blockhash_list.push(blockhash);
        if (blockhash_list.length > config.normalConfig.txMutilpler) { // 保存多个blockhash，以便提出多个交易
            blockhash_list.shift();
        }
    }).catch((error) => {
        logger.error(`get blockhash error: ${error}`);
    });
}, config.IntervalConfig.blockhashInterval);


// -------------------------------------------------
// 按规定时间更新slot
var latestSlot = (await con.getSlot());
// 本地更新slot
setInterval(() => {
    latestSlot += 1;
}, config.IntervalConfig.updateSlotInterval);
// 从链上获取slot
setInterval(() => {
    con.getSlot().then((res) => {
        latestSlot = res;
    }).catch((error) => {
        logger.error(`get latestSlot error: ${error}`);
    });
}, config.IntervalConfig.getSlotInterval);


// -------------------------------------------------
// 按规定时间更新优先费
var priorityFee = await lib.getPriorityFee(RPC);
setInterval(() => {
    lib.getPriorityFee(RPC).then((res) => {
        priorityFee = res;
    }).catch((error) => {
        logger.error(`get priorityFee error: ${error}`);
    });
}, config.IntervalConfig.priorityFeeInterval);


// -------------------------------------------------
// 保存地址查找表
var addressLookupTableList:AddressLookupTableAccount[] = [];
// 使用ws监听地址查找表的变化，一旦有变化则更新
interface subscribeListItem {
    id:number,
    address:string,
    subid:number | null
}
let subscribeList:subscribeListItem[] = [];

const wsUrl = 'wss://api.mainnet-beta.solana.com/';
let ws:WebSocket;

function connectWebSocket() {
    // 创建 WebSocket 连接
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
        logger.debug('ws connected');
    });

    ws.on('message', async (data) => {
        try {
            let msg;
            if (os.platform() === 'win32') {
                msg = JSON.parse(Buffer.from(data as string, 'hex').toString('utf-8'));
            } else {
                msg = JSON.parse(data as string);
            }
            if (msg.result) {
                if (msg.result === true) {
                    logger.info(`Unsubscribe success, id: ${msg.id}`);
                } else {
                    let index = subscribeList.findIndex((sub) => sub.id === msg.id);
                    if (index !== -1) {
                        subscribeList[index].subid = msg.result;
                    } else {
                        logger.error(`when update subscribeList, can't find the id... id: ${msg.id}`);
                    }
                }
            }
            if (msg.method === 'accountNotification') {
                const address = msg.params.result.value.data.parsed.info.authority;
                const result = await con.getAddressLookupTable(new PublicKey(address));
                let index = addressLookupTableList.findIndex((account) => account.key.toBase58() === new PublicKey(address).toBase58());
                if (index !== -1) {
                    addressLookupTableList[index] = result.value as AddressLookupTableAccount;
                    logger.info(`update addressLookupTableAccounts, address: ${address}`);
                } else {
                    logger.error(`when update addressLookupTableAccounts, can't find the account...address: ${address}`);
                }
            }
        } catch (err) {
            logger.error(`ws message error: ${err}`);
        }
    });

    ws.on('close', () => {
        logger.debug('ws closed');
        // 连接关闭时尝试重新连接
        setTimeout(() => {
            logger.debug('Attempting to reconnect...');
            connectWebSocket();
            subscribeList = [];
            addressLookupTableList = [];
        }, config.IntervalConfig.reconnectWsInterval);
    });

    ws.on('error', (err) => {
        logger.error(`ws error: ${err}`);
        // 出现错误时关闭连接
        ws.close();
    });
}

function subscribeAccount(address:string) {
    let id = Math.floor(Math.random() * 100000);
    let params = {
        "jsonrpc": "2.0",
        "id": id,
        "method": "accountSubscribe",
        "params": [
          address,
          {
            "encoding": "jsonParsed",
            "commitment": "finalized"
          }
        ]
    }
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(params));
        subscribeList.push({id:id,address:address,subid:null});
    } else {
        logger.error('WebSocket not connected');
    }
}

function unsubscribeAccount(address:string) {
    try {
        let subid = subscribeList.find((sub) => sub.address === address)?.subid;
        let id = subscribeList.find((sub) => sub.address === address)?.id;
        let params = {
            "jsonrpc": "2.0",
            "id": id,
            "method": "accountUnsubscribe",
            "params": [subid]
        }
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(params));
            subscribeList = subscribeList.filter((sub) => sub.address !== address);
            addressLookupTableList = addressLookupTableList.filter((account) => account.key.toBase58() !== address);
        } else {
            logger.error('WebSocket not connected');
        }
    } catch (err) {
        logger.error(`unsubscribeAccount error: ${err}`);
    }
}

connectWebSocket();

// ping保持连接
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
    }
}, config.IntervalConfig.wsPingInterval);
// 重新加载ws
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
}, config.IntervalConfig.wsReloadInterval);
// 设置地址查找表最大监听数量
setInterval(() => {
    if (addressLookupTableList.length > config.normalConfig.maxAddressLookupTableNum) {
        let address = addressLookupTableList[0].key.toBase58();
        unsubscribeAccount(address);
    }
}, config.IntervalConfig.adjustAddressLookupTableInterval);


// -------------------------------------------------
// 初始化套利参数
let minProfitBps = config.normalConfig.minProfitBps / 10000;
let partformFeeBps = config.normalConfig.partformFeeBps / 10000;
let minJitoTip = config.normalConfig.minJitoTip;
let trade_main = mainBalance * config.normalConfig.tradePercentageOfBalance;
let jitoFeePercentage = config.normalConfig.jitoFeePercentage;
let ifsendTxToBundle = config.submitTxMethodConfig.ifsendTxToBundle;
const JitoTipAccounts = config.JitoTipAccounts;
const BundleApis = config.BundleApis;

const instructionFormat = lib.instructionFormat;
const sendTxToRpc = lib.sendTxToRpc;
const sendTxToBundle = lib.sendTxToBundle;

interface monitorParams {
    pair1:config.TradePair,
    pair2:config.TradePair,
    con:Connection,
    jupCon:DefaultApi
}
async function monitor(params:monitorParams) {
    const {pair1,pair2,con,jupCon} = params;
    // 获取交易对信息
    const pair1_to_pair2 : QuoteGetRequest = {
        inputMint: pair1.mint,
        outputMint: pair2.mint,
        amount: Math.floor(trade_main),
        onlyDirectRoutes: config.normalConfig.directRoute,
        slippageBps: 0,
        maxAccounts: 28,
        swapMode: QuoteGetSwapModeEnum.ExactIn
    }
    const pair2_to_pair1 : QuoteGetRequest = {
        inputMint: pair2.mint,
        outputMint: pair1.mint,
        amount: Math.floor(trade_main),
        onlyDirectRoutes: config.normalConfig.directRoute,
        slippageBps: 0,
        swapMode: QuoteGetSwapModeEnum.ExactOut
    }
    try {
        let startRequestQuoteTime = Date.now();
        const [quote0Resp ,quote1Resp] = await Promise.all([
            jupCon.quoteGet(pair1_to_pair2),
            jupCon.quoteGet(pair2_to_pair1)
        ]);
        logger.debug(`${pair1.symbol}-${pair2.symbol} get quote cost: ${Date.now() - startRequestQuoteTime}ms`);
        // 检查是否是同一个池
        if (config.judgementConfig.ifJudgeSamePool) {
            if (quote0Resp?.routePlan[0].swapInfo.ammKey === quote1Resp?.routePlan[0].swapInfo.ammKey) {
                logger.debug(`pairs: ${pair1.symbol} ${pair2.symbol}, same pool, return...`)
                return;
            }
        }
        // 检查contextslot是否太滞后
        if (config.judgementConfig.ifJudgeSlotLatency) {
            let slotTolerance = config.normalConfig.maxTolerantSlotNum;
            if (latestSlot-slotTolerance > Number(quote0Resp?.contextSlot) || latestSlot-slotTolerance > Number(quote1Resp?.contextSlot)) {
                logger.debug(`pairs: ${pair1.symbol} ${pair2.symbol}, latestSlot: ${latestSlot}, quote0 slot: ${quote0Resp?.contextSlot}, quote1 slot: ${quote1Resp?.contextSlot}`)
                logger.debug(`pairs: ${pair1.symbol} ${pair2.symbol}, quote is outdated, return...`)
                return;
            }
        }
        // 检查两个报价的contextSlot差距
        if (config.judgementConfig.ifJudgeSlotDiffOfQuotes) {
            let slotLimit = config.normalConfig.maxTolerantSlotDiffNum;
            let slotDiff = Math.abs(Number(quote0Resp?.contextSlot)-Number(quote1Resp?.contextSlot))
            if (slotDiff > slotLimit) {
                logger.debug(`pairs: ${pair1.symbol} ${pair2.symbol}, contextSlot difference ${slotDiff} exceed ${slotLimit}, return...`)
                return;
            }   
        }
        // 
        let buyPrice = Number(quote0Resp?.outAmount) / Number(quote0Resp?.inAmount);
        let sellPrice = Number(quote1Resp?.inAmount) / Number(quote1Resp?.outAmount);
        if (sellPrice/buyPrice-1 > minProfitBps + partformFeeBps) {
            // 通过检查，开始交易
            logger.info(`${pair1.symbol} to ${pair2.symbol} price: ${buyPrice}`)
            logger.info(`${pair2.symbol} to ${pair1.symbol} price: ${sellPrice}`)
            logger.info(`${pair1.symbol} -> ${pair2.symbol} -> ${pair1.symbol} price difference: ${sellPrice/buyPrice}`)
            // 计算jito tip
            let jitoTip = Math.max(minJitoTip,Math.floor((sellPrice/buyPrice)*trade_main*jitoFeePercentage));
            
            // swap参数
            let mergedQuoteResp = quote0Resp as QuoteResponse;
            mergedQuoteResp.outputMint = (quote1Resp as QuoteResponse).outputMint;
            mergedQuoteResp.outAmount = ifsendTxToBundle ? (String(pair1_to_pair2.amount+jitoTip)) : (String(pair1_to_pair2.amount));
            mergedQuoteResp.otherAmountThreshold = ifsendTxToBundle ? (String(pair1_to_pair2.amount+jitoTip)) : (String(pair1_to_pair2.amount));
            mergedQuoteResp.priceImpactPct = String(0);
            mergedQuoteResp.routePlan = mergedQuoteResp.routePlan.concat((quote1Resp as QuoteResponse).routePlan);
            let swapData : SwapRequest = {
                "userPublicKey": payer.publicKey.toBase58(),
                "wrapAndUnwrapSol": false,
                "useSharedAccounts": false,
                "skipUserAccountsRpcCalls": true,
                "quoteResponse": mergedQuoteResp,
            }

            // 构建交易
            try {
                let startGetSwapInstructionTime = Date.now();
                let instructions = await jupCon.swapInstructionsPost({ swapRequest: swapData })
                logger.debug(`${pair1.symbol}-${pair2.symbol} get swap instructions cost: ${Date.now() - startGetSwapInstructionTime}ms`);

                let ixs : TransactionInstruction[] = [];
                let cu_ixs : TransactionInstruction[] = [];
                let cu_num = config.normalConfig.computeUnitBudget;
                let priorfee = lib.selectPriorityFee(priorityFee as lib.priorityFeeResponse,lib.calculatePriorityLevel(sellPrice/buyPrice-1));

                // 1. setup instructions
                const setupInstructions = instructions.setupInstructions.map(instructionFormat);
                ixs = ixs.concat(setupInstructions);

                // 2. swap instructions
                const swapInstructions = instructionFormat(instructions.swapInstruction);
                ixs.push(swapInstructions);

                // 3. 调用computeBudget设置cu
                const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                    units: cu_num,
                })
                cu_ixs.push(computeUnitLimitInstruction);

                // 4. 调用computeBudget设置优先费
                const computeUnitPriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports:priorfee,
                })
                cu_ixs.push(computeUnitPriceInstruction);
                // 合并cu_ixs
                ixs = cu_ixs.concat(ixs);

                if (ifsendTxToBundle) {
                    // 5. 添加jito tip
                    const tipInstruction = SystemProgram.transfer({
                        fromPubkey: payer.publicKey,
                        toPubkey: new PublicKey(JitoTipAccounts[Math.floor(Math.random()*JitoTipAccounts.length)]),
                        lamports: jitoTip,
                    })
                    ixs.push(tipInstruction);
                }

                const addressLookupTableAccounts = await Promise.all(
                    instructions.addressLookupTableAddresses.map(async (address) => {
                        let index = addressLookupTableList.findIndex((account) => account.key.toBase58() === new PublicKey(address).toBase58());
                        if (index !== -1) {
                            return addressLookupTableList[index];
                        } else {
                            const result = await con.getAddressLookupTable(new PublicKey(address));
                            addressLookupTableList.push(result.value as AddressLookupTableAccount);
                            subscribeAccount(address);
                            return result.value as AddressLookupTableAccount;
                        }
                    })
                );

                // v0 tx
                let txs : VersionedTransaction[] = [];
                blockhash_list.map((blockhash) => {
                    const messageV0 = new TransactionMessage({
                        payerKey: payer.publicKey,
                        recentBlockhash: blockhash,
                        instructions: ixs,
                    }).compileToV0Message(addressLookupTableAccounts);
                    const transaction = new VersionedTransaction(messageV0);
                    transaction.sign([payer]);
                    txs.push(transaction);
                });

                // 提交交易
                try {
                    let promises : Promise<void>[] = [];
                    if (ifsendTxToBundle) {
                        for (let i=0; i<txs.length; i++) {
                            promises.push(sendTxToBundle(txs[i],BundleApis[i%BundleApis.length],tradeLogger,`${pair1.symbol}-${pair2.symbol}`));
                        }
                        await Promise.all(promises);
                    } else {
                        for (let i=0; i<txs.length; i++) {
                            promises.push(sendTxToRpc(txs[i],sendTxCons[i%sendTxCons.length],tradeLogger,`${pair1.symbol}-${pair2.symbol}`));
                        }
                        await Promise.all(promises);
                    }
                } catch (error) {
                    logger.error(`${pair1.symbol}-${pair2.symbol} submit tx error: ${error}`);
                }

            } catch (error) {
                logger.error(`${pair1.symbol}-${pair2.symbol} build tx error: ${error}`);
            }         
        }
    } catch (error) {
        logger.error(`monitor error: ${error}`);
    }
}


// 主函数
let wait = (ms:number) => new Promise((resolve) => setTimeout(resolve,ms));
let waitTime = config.normalConfig.waitTimePerRound;
let trade_pairs = config.trade_pairs;
let {pair1,timeSpan,pairNum} = trade_pairs;
var pair2s:config.TradePair[] = [];
if (trade_pairs.pair2s.length > 0) {
    pair2s = trade_pairs.pair2s;
} else {
    pair2s = await lib.getPairs({timeSpan:timeSpan,pairNum:pairNum});
    // 每隔一段时间获取一次交易对
    setInterval(async () => {
        try {
            pair2s = await lib.getPairs({timeSpan:timeSpan,pairNum:pairNum});
        } catch (err) {
            logger.error(`getPairs error, use last pairs...`)
        }
    }, config.IntervalConfig.updateTradePairsInterval);
}

let num = 0;
async function main(num:number) {
    // 监测套利机会
    await monitor({
        pair1:pair1,
        pair2:pair2s[num],
        con:con,
        jupCon:jupCon
    })
    console.log(`waiting for ${waitTime}ms...`)
    await wait(waitTime);
    main((num+1)%pair2s.length);
}

main(num).then(() => {
    console.log('start next round...')
}).catch((err) => {
    logger.error(err);
});