import axios from 'axios';
import FormData from 'form-data';
import fs from 'node:fs';

export type WhatsAppMessageResult = {
  messageId: string;
};

export async function sendTemplateWithMedia(params: {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  language: string;
  to: string;
  tenantName: string;
  period: string;
  billNumber: string;
  room: string;
  amount: string;
  payDate: string;
  mediaId: string;
}) {
  const client = axios.create({
    baseURL: 'https://graph.facebook.com/v21.0',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  const response = await client.post(`/${params.phoneNumberId}/messages`, {
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
          parameters: [
            { type: 'text', text: params.tenantName },
            { type: 'text', text: params.period },
            { type: 'text', text: params.billNumber },
            { type: 'text', text: params.room },
            { type: 'text', text: params.amount },
            { type: 'text', text: params.payDate },
          ],
        },
      ],
    },
  });

  const messageId = response.data?.messages?.[0]?.id ?? '';
  return { messageId };
}

export async function sendTextMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}) {
  const client = axios.create({
    baseURL: 'https://graph.facebook.com/v21.0',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  const response = await client.post(`/${params.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'text',
    text: {
      body: params.body,
    },
  });

  const messageId = response.data?.messages?.[0]?.id ?? '';
  return { messageId };
}

export async function uploadMedia(params: { phoneNumberId: string; accessToken: string; filePath: string }) {
  const client = axios.create({
    baseURL: 'https://graph.facebook.com/v21.0',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
  });

  const form = new FormData();
  form.append('file', fs.createReadStream(params.filePath));
  form.append('type', 'application/pdf');
  form.append('messaging_product', 'whatsapp');

  const response = await client.post(`/${params.phoneNumberId}/media`, form, {
    headers: form.getHeaders(),
  });
  return { mediaId: response.data?.id as string };
}
