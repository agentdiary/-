"""运行期配置:数据落盘位置与跨域白名单。

数据默认仍落在 server/ 下,本机开发流程不变。**部署时必须把
AGENTDIARY_DATA_DIR 指到代码目录之外**(如 /var/lib/agentdiary),否则
git pull / 重新部署会直接踩到数据库和用户头像——那是不可逆的数据丢失。
"""

import os
from pathlib import Path

_SERVER_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = Path(os.environ.get("AGENTDIARY_DATA_DIR") or _SERVER_DIR)
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "agentdiary.db"
AVATAR_DIR = DATA_DIR / "avatars"

# 移动端不受 CORS 约束,这里管的是 Expo web 构建。开发期默认放开,
# 上线时设成具体域名(逗号分隔)
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
