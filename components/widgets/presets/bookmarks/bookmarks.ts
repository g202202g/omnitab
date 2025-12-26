import { browser } from 'wxt/browser';

export type BookmarkTreeNode = {
  id: string;
  title?: string;
  url?: string;
  parentId?: string;
  children?: BookmarkTreeNode[];
};

export type IndexedBookmarkNode = {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  childrenIds: string[];
  isFolder: boolean;
};

export type BookmarkIndex = {
  roots: string[];
  nodes: Map<string, IndexedBookmarkNode>;
};

export type FolderOption = {
  id: string;
  label: string;
  path: string;
  depth: number;
};

export const loadBookmarkTree = async (): Promise<BookmarkTreeNode[] | null> => {
  const api: any = (browser as any)?.bookmarks;
  if (!api?.getTree) return null;
  try {
    return (await api.getTree()) as unknown as BookmarkTreeNode[];
  } catch (error) {
    console.warn('bookmarks.getTree failed', error);
    return null;
  }
};

const normalizeTitle = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  return '';
};

export const buildBookmarkIndex = (tree: BookmarkTreeNode[]): BookmarkIndex => {
  const nodes = new Map<string, IndexedBookmarkNode>();
  const roots: string[] = [];

  const walk = (node: BookmarkTreeNode, parentId?: string) => {
    const id = String(node?.id ?? '');
    if (!id) return;
    const title = normalizeTitle(node.title);
    const url = typeof node.url === 'string' && node.url.trim() ? node.url.trim() : undefined;
    const children = Array.isArray(node.children) ? node.children : [];
    const childrenIds = children.map((child) => String(child?.id ?? '')).filter(Boolean);
    const isFolder = !url;

    nodes.set(id, {
      id,
      title,
      url,
      parentId: typeof node.parentId === 'string' ? node.parentId : parentId,
      childrenIds,
      isFolder,
    });

    children.forEach((child) => walk(child, id));
  };

  (Array.isArray(tree) ? tree : []).forEach((root) => {
    const id = String(root?.id ?? '');
    if (id) roots.push(id);
    walk(root);
  });

  return { roots, nodes };
};

export const getNodePathTitles = (index: BookmarkIndex, nodeId: string) => {
  const titles: string[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = nodeId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = index.nodes.get(cursor);
    if (!node) break;
    if (node.title) titles.push(node.title);
    cursor = node.parentId;
  }
  return titles.reverse();
};

const DEFAULT_FOLDER_TITLE_CANDIDATES = [
  '书签栏',
  '书签工具栏',
  '书签栏工具栏',
  'Bookmarks Bar',
  'Bookmarks Toolbar',
  'Toolbar',
];

export const findDefaultFolderId = (index: BookmarkIndex): string | null => {
  const candidates = DEFAULT_FOLDER_TITLE_CANDIDATES.map((t) => t.toLowerCase());
  for (const node of index.nodes.values()) {
    if (!node.isFolder) continue;
    if (!node.title) continue;
    const titleLower = node.title.toLowerCase();
    if (candidates.some((t) => t === titleLower)) return node.id;
  }

  // 兜底：找第一个“非根节点”的文件夹（有标题优先）
  for (const node of index.nodes.values()) {
    if (!node.isFolder) continue;
    if (node.parentId && node.title) return node.id;
  }
  for (const node of index.nodes.values()) {
    if (!node.isFolder) continue;
    if (node.parentId) return node.id;
  }
  return null;
};

export const buildFolderOptions = (index: BookmarkIndex, opts?: { includeRoots?: boolean }) => {
  const options: FolderOption[] = [];
  const includeRoots = opts?.includeRoots === true;
  const visited = new Set<string>();

  const nodeLabel = (node: IndexedBookmarkNode) => node.title || '未命名文件夹';

  const walkFolder = (folderId: string, depth: number) => {
    if (visited.has(folderId)) return;
    visited.add(folderId);
    const node = index.nodes.get(folderId);
    if (!node || !node.isFolder) return;

    if (includeRoots || node.parentId) {
      const titles = getNodePathTitles(index, folderId);
      options.push({
        id: folderId,
        depth,
        label: `${'  '.repeat(Math.max(0, depth))}${nodeLabel(node)}`,
        path: titles.join(' / ') || nodeLabel(node),
      });
    }

    node.childrenIds.forEach((childId) => {
      const child = index.nodes.get(childId);
      if (!child?.isFolder) return;
      walkFolder(childId, depth + 1);
    });
  };

  index.roots.forEach((rootId) => {
    const root = index.nodes.get(rootId);
    if (!root) return;
    if (root.isFolder) {
      walkFolder(rootId, includeRoots ? 0 : -1);
    }
  });

  return options;
};
