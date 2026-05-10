type WhatsAppUploadResponse = {
  id?: string;
};

type WhatsAppSendResponse = {
  messages?: Array<{ id?: string }>;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const errorMessage =
      (payload as any)?.error?.message ??
      (payload as any)?.message ??
      `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }
  if (!payload) {
    throw new Error('Empty response from WhatsApp API');
  }
  return payload;
}

export async function uploadWhatsAppMedia(params: {
  phoneNumberId: string;
  accessToken: string;
  fileBytes: Uint8Array;
  fileName: string;
}) {
  const form = new FormData();
  const fileBuffer = params.fileBytes.buffer.slice(params.fileBytes.byteOffset, params.fileBytes.byteOffset + params.fileBytes.byteLength) as ArrayBuffer;
  form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), params.fileName);
  form.append('type', 'application/pdf');
  form.append('messaging_product', 'whatsapp');

  const response = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: form,
  });

  const payload = await readJsonResponse<WhatsAppUploadResponse>(response);
  if (!payload.id) {
    throw new Error('WhatsApp media upload did not return a media id');
  }
  return { mediaId: payload.id };
}

export async function sendWhatsAppTemplateWithMedia(params: {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  language: string;
  to: string;
  bodyParams: string[];
  mediaId: string;
}) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: { id: params.mediaId, filename: 'bill.pdf' },
              },
            ],
          },
          {
            type: 'body',
            parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    }),
  });

  const payload = await readJsonResponse<WhatsAppSendResponse>(response);
  const messageId = payload.messages?.[0]?.id ?? '';
  if (!messageId) {
    throw new Error('WhatsApp message send did not return a message id');
  }
  return { messageId };
}

export async function sendWhatsAppReminderTemplate(params: {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  language: string;
  to: string;
  bodyParams: string[];
}) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        components: [
          {
            type: 'body',
            parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    }),
  });

  const payload = await readJsonResponse<WhatsAppSendResponse>(response);
  const messageId = payload.messages?.[0]?.id ?? '';
  if (!messageId) {
    throw new Error('WhatsApp message send did not return a message id');
  }
  return { messageId };
}
