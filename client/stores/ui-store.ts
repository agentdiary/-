import { create } from 'zustand';

// 左侧导航栏显隐(会话级,不持久化):
// 点按页面标题(日记/对话)切换显示,点按栏内空白处收起
interface UiState {
  railVisible: boolean;
  toggleRail: () => void;
  hideRail: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  railVisible: false,
  toggleRail: () => set((s) => ({ railVisible: !s.railVisible })),
  hideRail: () => set({ railVisible: false }),
}));
