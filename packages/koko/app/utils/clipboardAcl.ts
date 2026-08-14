import type {
  ClipboardAccess,
  ClipboardDirection,
  ClipboardDirectionAccess,
  ClipboardPermission,
  ClipboardPolicy,
  ClipboardPolicyItem,
  ClipboardValidationResult
} from "#koko/types";

const normalizeLimit = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const hasAction = (permission: ClipboardPermission | null | undefined, action: ClipboardDirection) => {
  if (!Array.isArray(permission?.actions)) {
    // Shared and monitored sessions may not include token permissions.
    return true;
  }

  return permission.actions.some((item) => {
    const value = typeof item === "string" ? item : item?.value;
    return value === "all" || value === action;
  });
};

const resolveDirectionAccess = (
  direction: ClipboardDirection,
  permission?: ClipboardPermission | null,
  item?: ClipboardPolicyItem | null
): ClipboardDirectionAccess => {
  const policyAllows = typeof item?.enabled === "boolean" ? item.enabled : true;
  const operationHasAcl = item?.acl_action !== null;

  return {
    enabled: hasAction(permission, direction) && policyAllows,
    textLimit: operationHasAcl ? normalizeLimit(item?.text_limit) : 0,
    fileSizeLimit: operationHasAcl ? normalizeLimit(item?.file_size_limit) : 0
  };
};

export const createUnrestrictedClipboardAccess = (): ClipboardAccess => ({
  copy: { enabled: true, textLimit: 0, fileSizeLimit: 0 },
  paste: { enabled: true, textLimit: 0, fileSizeLimit: 0 }
});

export const resolveClipboardAccess = (
  permission?: ClipboardPermission | null,
  policy?: ClipboardPolicy | null
): ClipboardAccess => ({
  copy: resolveDirectionAccess("copy", permission, policy?.copy),
  paste: resolveDirectionAccess("paste", permission, policy?.paste)
});

export const getClipboardTextLength = (text: string) => Array.from(text).length;

export const validateClipboardText = (
  access: ClipboardAccess,
  direction: ClipboardDirection,
  text: string
): ClipboardValidationResult => {
  const directionAccess = access[direction];

  if (!directionAccess.enabled) return { allowed: false, reason: "permission" };

  if (directionAccess.textLimit > 0 && getClipboardTextLength(text) > directionAccess.textLimit) {
    return { allowed: false, reason: "text_limit", limit: directionAccess.textLimit };
  }

  return { allowed: true };
};
