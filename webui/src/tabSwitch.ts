import type { QueryTab } from './urlState';

export type TabSearchState = {
  tab: QueryTab;
  search: string;
};

// 两个 Tab 共用同一份 search state：切走时若留着上一个 Tab 的关键词，
// 新 Tab 一进来就是被过滤后的空列表，所以真正换 Tab 时清空输入框。
// 重复点当前 Tab 不算切换，保留用户已输入的内容。
export const applyTabChange = (current: TabSearchState, nextTab: QueryTab): TabSearchState =>
  nextTab === current.tab ? current : { tab: nextTab, search: '' };
