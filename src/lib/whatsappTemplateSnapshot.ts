/**
 * Immutable, display-oriented record of a resolved Meta template.  It deliberately
 * contains the values sent to the recipient, not a pointer to a mutable template
 * definition.  Both the Edge Functions and the Inbox can use this dependency-free
 * module.
 */
export type WhatsAppTemplateHeaderType = 'text' | 'image' | 'video' | 'document';

export interface WhatsAppTemplateHeader {
  type: WhatsAppTemplateHeaderType;
  text?: string;
  media_url?: string;
  media_path?: string;
  filename?: string;
}

export interface WhatsAppTemplateButton {
  type: 'quick_reply' | 'url' | 'phone';
  text: string;
  url?: string;
  phone?: string;
}

export interface WhatsAppTemplateSnapshot {
  version: 1;
  template_name: string;
  language: string;
  header?: WhatsAppTemplateHeader | null;
  body: string;
  footer?: string;
  buttons?: WhatsAppTemplateButton[];
  resolved_parameters: string[];
}

type MetaParameter = { type?: string; text?: unknown; image?: { link?: unknown }; video?: { link?: unknown }; document?: { link?: unknown; filename?: unknown } };
type MetaComponent = { type?: string; parameters?: MetaParameter[] };
type MetaPayload = { type?: string; template?: { name?: string; language?: { code?: string }; components?: MetaComponent[] } };

const nonEmpty = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

/** Build the snapshot from the exact payload and exact rendered body already resolved for Meta. */
export function createTemplateSnapshot(input: {
  templateName: string;
  language: string;
  body: string;
  /** The exact Meta payload returned by the existing sender; narrowed defensively below. */
  payload: unknown;
  footer?: string;
  buttons?: WhatsAppTemplateButton[];
}): WhatsAppTemplateSnapshot {
  const metaPayload = input.payload as MetaPayload;
  const components = metaPayload.template?.components ?? [];
  const headerComponent = components.find((component) => component.type === 'header');
  const bodyComponent = components.find((component) => component.type === 'body');
  const headerParameter = headerComponent?.parameters?.[0];
  let header: WhatsAppTemplateHeader | null = null;

  if (headerParameter?.type === 'text' && nonEmpty(headerParameter.text)) {
    header = { type: 'text', text: String(headerParameter.text) };
  } else if (headerParameter?.type === 'image') {
    header = { type: 'image', media_url: nonEmpty(headerParameter.image?.link) };
  } else if (headerParameter?.type === 'video') {
    header = { type: 'video', media_url: nonEmpty(headerParameter.video?.link) };
  } else if (headerParameter?.type === 'document') {
    header = {
      type: 'document',
      media_url: nonEmpty(headerParameter.document?.link),
      filename: nonEmpty(headerParameter.document?.filename),
    };
  }

  return {
    version: 1,
    template_name: input.templateName,
    language: input.language,
    ...(header ? { header } : {}),
    body: input.body,
    ...(input.footer ? { footer: input.footer } : {}),
    ...(input.buttons?.length ? { buttons: input.buttons } : {}),
    resolved_parameters: (bodyComponent?.parameters ?? [])
      .map((parameter) => nonEmpty(parameter.text))
      .filter((value): value is string => Boolean(value)),
  };
}

/** Defensive parser for JSONB/realtime data. Invalid or historical values use text fallback. */
export function parseTemplateSnapshot(value: unknown): WhatsAppTemplateSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<WhatsAppTemplateSnapshot>;
  if (snapshot.version !== 1 || !nonEmpty(snapshot.template_name) || !nonEmpty(snapshot.language) || !nonEmpty(snapshot.body)) return null;
  return snapshot as WhatsAppTemplateSnapshot;
}
