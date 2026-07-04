"""隐私实体脱敏 —— 蒸馏 pipeline 的强制入口(红线:先脱敏再进入任何蒸馏步骤)。

v1 占位:仅做正则级别的粗脱敏。
后续替换为 NER 模型(人名/地名/机构/联系方式)+ 可逆映射表。
"""

import re

_PATTERNS: list[tuple[str, str]] = [
    (r"1[3-9]\d{9}", "[手机号]"),
    (r"[\w.+-]+@[\w-]+\.[\w.]+", "[邮箱]"),
    (r"\d{17}[\dXx]", "[身份证号]"),
]


def sanitize(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text
