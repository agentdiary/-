// 内置名人化身的肖像(公有领域图片,来源维基共享资源)。
// key 与后端 celebrities.py 的 username 一致。

import type { ImageSourcePropType } from 'react-native';

export const CELEBRITY_PORTRAITS: Record<string, ImageSourcePropType> = {
  鲁迅: require('@/assets/images/celebrities/luxun.jpg'),
  雨果: require('@/assets/images/celebrities/hugo.jpg'),
  李白: require('@/assets/images/celebrities/libai.jpg'),
};

// 普通用户的首字母头像底色(按用户名哈希取色,同一用户永远同色)
const AVATAR_COLORS = ['#6b9bd1', '#d1936b', '#7fb586', '#9b8ac4', '#d17f9b', '#5fb3b3'];

export function avatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
