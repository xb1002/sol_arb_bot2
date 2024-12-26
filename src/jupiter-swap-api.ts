import {getPairs} from './lib.js'
import { TradePair,trade_pairs } from './config.js'
import fs from 'fs'

// 获取交易对
const {timeSpan,startNum,pairNum} = trade_pairs
const pairs = await getPairs({timeSpan,startNum,pairNum})

// 把pairs写入文件trade_pairs.json
fs.writeFileSync('./trade_pairs.json',JSON.stringify(pairs,null,2))

let cmdCommand = 'RUST_LOG=info ./jupiter-swap-api --rpc-url https://solana-rpc.publicnode.com --allow-circular-arbitrage --market-mode remote --filter-markets-with-mints So11111111111111111111111111111111111111112,' + pairs.map((pair:TradePair)=>pair.mint).join(',')

console.log(cmdCommand)
