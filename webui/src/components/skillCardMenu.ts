type MenuRoot = {
  contains: (target: object) => boolean;
};

export const shouldCloseSkillCardMenu = (menuRoot: MenuRoot | null, target: object | null): boolean => (
  Boolean(menuRoot && target && !menuRoot.contains(target))
);
