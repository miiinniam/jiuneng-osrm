"""
越南柴油零售价抓取 —— 从 Petrolimex 官网获取 DO 0,05S-II 当前价格。

独立运行: python scripts/fuel_price_fetcher.py [--update]
  - 不带参数：打印当前价格，不修改任何文件
  - --update：更新 backend/app/config.py 中的 default_fuel_price_vnd

Cron 建议（Hermes）:
  hermes cronjob create --name "fuel-price-update" --schedule "0 8 * * *" \
    --prompt "运行 python scripts/fuel_price_fetcher.py --update 更新油价到 config.py" \
    --workdir "D:/01_业务/玖能/OSRM/OSRM++/backend"
"""

import re
import sys
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent.parent / "app" / "config.py"


def extract_price_from_text(text: str) -> dict[str, float]:
    """从页面文本中提取油价表数据。"""
    prices = {}
    # Petrolimex 价格表格式: 产品名 Vùng1 Vùng2
    # DO 0,05S-II  21,860  22,290
    pattern = r"(DO 0[,.]05S-II|Xăng[^0-9]*RON[^0-9]*\d[^0-9]*)\s+([\d,]+)\s+([\d,]+)"
    for m in re.finditer(pattern, text):
        product = m.group(1).strip()
        try:
            price1 = float(m.group(2).replace(",", ""))
            prices[product + " (Vùng 1)"] = price1
            price2 = float(m.group(3).replace(",", ""))
            prices[product + " (Vùng 2)"] = price2
        except ValueError:
            continue
    return prices


def update_config(price: float) -> bool:
    config_text = CONFIG_PATH.read_text(encoding="utf-8")
    pattern = r"(default_fuel_price_vnd:\s*float\s*=\s*)[\d.]+(\s*#.*)"
    match = re.search(pattern, config_text)
    if not match:
        print("ERROR: 找不到 default_fuel_price_vnd", file=sys.stderr)
        return False

    old_price = float(re.search(r"[\d.]+", match.group(0)[match.start(1):]).group())
    if abs(old_price - price) < 0.5:
        print(f"油价未变: {price:,.0f} ₫/L")
        return False

    new_line = f"{match.group(1)}{price:.1f}{match.group(2)}"
    CONFIG_PATH.write_text(
        config_text[: match.start()] + new_line + config_text[match.end() :],
        encoding="utf-8",
    )
    print(f"已更新 config.py: {old_price:,.0f} → {price:,.0f} ₫/L")
    return True


def main():
    do_update = "--update" in sys.argv

    # 优先尝试从环境变量读取（由 Hermes cron agent 通过 browser 抓取后传入）
    import os

    env_price = os.getenv("FETCHED_FUEL_PRICE_VND")
    if env_price:
        price = float(env_price)
        print(f"油价 (来自环境变量): {price:,.0f} ₫/L")

        if do_update:
            update_config(price)
            print(f"校准命令: FIXED_FUEL_PRICE_VND={price:.0f} PYTHONIOENCODING=utf-8 python -m app.services.calibration samples_all.json")
        return

    # 如果直接用 curl 能拿到 Petrolimex 页面
    try:
        import requests
        resp = requests.get(
            "https://www.petrolimex.com.vn/",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=30,
        )
        prices = extract_price_from_text(resp.text)
    except Exception:
        prices = {}

    if not prices:
        print("无法从 Petrolimex 抓取油价（页面可能依赖 JS 动态加载）", file=sys.stderr)
        print("请在 Hermes 中让 Agent 使用 browser 工具访问 petrolimex.com.vn 提取油价", file=sys.stderr)
        print("当前 config.py 中的价格为基准值", file=sys.stderr)
        sys.exit(1)

    # 找到柴油价格
    diesel_price = None
    for name, price in prices.items():
        if "DO 0,05" in name and "Vùng 1" in name:
            diesel_price = price
            break

    if diesel_price is None:
        print("未找到 DO 0,05S-II 价格", file=sys.stderr)
        sys.exit(1)

    print(f"Petrolimex DO 0,05S-II (Vùng 1): {diesel_price:,.0f} ₫/L")

    if do_update:
        update_config(diesel_price)
        print(f"校准: FIXED_FUEL_PRICE_VND={diesel_price:.0f}")


if __name__ == "__main__":
    main()
