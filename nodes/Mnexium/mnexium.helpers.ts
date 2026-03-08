import { createHmac } from 'crypto';

import { NodeOperationError, type IDataObject, type INode } from 'n8n-workflow';

export function ensurePath(path: string): string {
	if (!path) return '/';
	return path.startsWith('/') ? path : `/${path}`;
}

export function parseJsonObject(
	raw: unknown,
	label: string,
	itemIndex: number,
	node: INode,
): IDataObject {
	if (raw === undefined || raw === null || raw === '') {
		return {};
	}

	if (typeof raw === 'string') {
		const text = raw.trim();
		if (!text) return {};
		try {
			const parsed = JSON.parse(text);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('must be a JSON object');
			}
			return parsed as IDataObject;
		} catch (error) {
			throw new NodeOperationError(node, `${label} must be valid JSON object: ${(error as Error).message}`, {
				itemIndex,
			});
		}
	}

	if (typeof raw === 'object' && !Array.isArray(raw)) {
		return raw as IDataObject;
	}

	throw new NodeOperationError(node, `${label} must be a JSON object`, { itemIndex });
}

export function parseJsonArray(
	raw: unknown,
	label: string,
	itemIndex: number,
	node: INode,
): unknown[] {
	if (raw === undefined || raw === null || raw === '') {
		return [];
	}

	if (typeof raw === 'string') {
		const text = raw.trim();
		if (!text) return [];
		try {
			const parsed = JSON.parse(text);
			if (!Array.isArray(parsed)) {
				throw new Error('must be a JSON array');
			}
			return parsed;
		} catch (error) {
			throw new NodeOperationError(node, `${label} must be valid JSON array: ${(error as Error).message}`, {
				itemIndex,
			});
		}
	}

	if (Array.isArray(raw)) {
		return raw;
	}

	throw new NodeOperationError(node, `${label} must be a JSON array`, { itemIndex });
}

export function parseOptionalJsonObject(
	raw: unknown,
	label: string,
	itemIndex: number,
	node: INode,
): IDataObject | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw === 'string' && raw.trim() === '') return undefined;
	return parseJsonObject(raw, label, itemIndex, node);
}

export function parseOptionalJsonArray(
	raw: unknown,
	label: string,
	itemIndex: number,
	node: INode,
): unknown[] | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (typeof raw === 'string' && raw.trim() === '') return undefined;
	return parseJsonArray(raw, label, itemIndex, node);
}

export function parseOptionalNumberString(
	raw: unknown,
	label: string,
	itemIndex: number,
	node: INode,
): number | undefined {
	if (raw === undefined || raw === null) return undefined;
	const text = String(raw).trim();
	if (!text) return undefined;
	const num = Number(text);
	if (!Number.isFinite(num)) {
		throw new NodeOperationError(node, `${label} must be a valid number`, { itemIndex });
	}
	return num;
}

export function parseTriStateBoolean(value: unknown): boolean | undefined {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized || normalized === 'omit' || normalized === 'no_change') return undefined;
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	return undefined;
}

export function setHeaderIfValue(headers: IDataObject, key: string, value?: string): void {
	if (value && value.trim()) {
		headers[key] = value.trim();
	}
}

export function setHeaderIfMissing(headers: IDataObject, key: string, value?: string): void {
	if (!value || !value.trim()) return;
	if (!hasHeader(headers, key)) {
		headers[key] = value.trim();
	}
}

export function hasHeader(headers: IDataObject, key: string): boolean {
	const target = key.toLowerCase();
	return Object.keys(headers).some((k) => k.toLowerCase() === target);
}

export function parseBooleanParam(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
		if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
	}
	return false;
}

export function normalizeWebhookSignature(signature: unknown): string {
	return String(signature || '').trim().replace(/^sha256=/i, '').toLowerCase();
}

export function computeWebhookSignature(secret: string, timestamp: string | number, rawBody: string): string {
	return createHmac('sha256', String(secret || ''))
		.update(`${String(timestamp || '')}.${String(rawBody || '')}`)
		.digest('hex');
}

function parseUserMessageContent(content: unknown): string {
	if (typeof content === 'string') return content.trim();
	if (Array.isArray(content)) {
		const parts = content
			.map((part) => {
				if (typeof part === 'string') return part.trim();
				if (part && typeof part === 'object' && 'text' in (part as IDataObject)) {
					return String((part as IDataObject).text || '').trim();
				}
				return '';
			})
			.filter(Boolean);
		return parts.join('\n').trim();
	}
	return '';
}

export function extractExternalUserMessage(itemJson: IDataObject): string {
	const directCandidates = ['message', 'text', 'input', 'prompt', 'query', 'content'];
	for (const key of directCandidates) {
		const value = itemJson[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}

	const messages = itemJson.messages;
	if (Array.isArray(messages)) {
		for (let idx = messages.length - 1; idx >= 0; idx--) {
			const message = messages[idx];
			if (!message || typeof message !== 'object') continue;
			const role = String((message as IDataObject).role || '').toLowerCase();
			if (role !== 'user') continue;
			const parsed = parseUserMessageContent((message as IDataObject).content);
			if (parsed) return parsed;
		}
	}

	return '';
}
