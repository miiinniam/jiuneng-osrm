"""应用配置（Pydantic BaseSettings，DEVELOPMENT_GOALS.md §4）。

从环境变量 / .env 文件加载，字段自动映射（例如 DEEPSEEK_API_KEY）。
未设置的环境变量使用默认值；类型错误在启动时报错。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── OSRM ──
    osrm_base_url: str = "http://localhost:5001"
    # 当前本地 OSRM 数据只按默认 car profile 编译，truck profile 待办（§5.2 / §11）。
    osrm_profile: str = "driving"

    # ── 成本预设（附录A） ──
    default_fuel_price_vnd: float = 23320.0   # Petrolimex DO 0,05S-II Vùng 1 2026-07-16
    default_wage_hourly_vnd: float = 180000.0  # 附录A：月薪 ÷ 22天 ÷ 8小时
    loading_rate_vnd_per_ton: float = 50000.0  # §6.3.4
    insurance_rate: float = 0.003              # §6.3.4：货值 × 0.3%

    # ── DeepSeek AI ──
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"  # V4 Flash 用 deepseek-chat
    deepseek_max_tokens: int = 4096
    deepseek_temperature: float = 0.0      # 分析任务用 0 保证一致性
    deepseek_chat_temperature: float = 0.3  # 对话聊天用稍高的温度


settings = Settings()
