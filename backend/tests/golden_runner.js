/* golden_runner.js — packer.js 内核基准运行器 (golden tests 用)
 * 用法: node golden_runner.js <packer.js路径> <cases.json>
 * 输出: JSON 数组, 每元素 = Packer.pack(truck, cargo, opts) 的 {placements, unplaced}
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const packerPath = process.argv[2];
const casesPath = process.argv[3];

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(packerPath, 'utf8'), ctx, { filename: packerPath });

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
// 注意: opts 缺省必须传 undefined (不是 {}) — packer.js 里 opts 为 falsy 才走 truck.type 默认,
// {} 会 truthy 导致 allowOverflow 恒 false. 与 Python 端 case.get("opts")->None 语义对齐。
const out = cases.map(c => ctx.window.Packer.pack(c.truck, c.cargo, c.opts || undefined));
process.stdout.write(JSON.stringify(out));
