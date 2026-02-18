import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import {
	ensurePath,
	extractExternalUserMessage,
	hasHeader,
	parseBooleanParam,
	parseJsonArray,
	parseJsonObject,
	parseOptionalNumberString,
	parseTriStateBoolean,
	setHeaderIfMissing,
	setHeaderIfValue,
} from './mnexium.helpers';
import { mnexiumProperties } from './mnexium.properties';

export class Mnexium implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mnexium',
		name: 'mnexium',
		icon: 'file:mnexium.png',
		group: ['transform'],
		version: 1,
		subtitle:
			'={{$parameter["resource"] === "chat" ? "message: text" : $parameter["resource"] + ": " + ($parameter["operation"] || "request")}}',
		description: 'Use Mnexium memory, claims, profiles, state, records, prompts, and audit APIs',
		defaults: {
			name: 'Mnexium',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'mnexiumApi',
				displayName: 'Mnexium API Credential',
				required: false,
			},
		],
		properties: mnexiumProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const node = this.getNode();

		let credentials: IDataObject = {};
		try {
			credentials = (await this.getCredentials('mnexiumApi')) as IDataObject;
		} catch {
			credentials = {};
		}

		const baseUrl = 'https://www.mnexium.com';
		const allowedCustomRequestHosts = new Set(['www.mnexium.com', 'mnexium.com']);
		const credentialApiKey = String(credentials.apiKey || '').trim();
		const credentialOpenAiKey = String(credentials.openAiKey || '').trim();
		const credentialAnthropicKey = String(credentials.anthropicKey || '').trim();
		const credentialGoogleKey = String(credentials.googleKey || '').trim();
		const customRequestDefaultMethod: IHttpRequestMethods = 'GET';

		const operationDefaultByResource: Record<string, string> = {
			chat: 'chatCompletions',
			history: 'list',
			memory: 'list',
			claim: 'getTruth',
			profile: 'get',
			state: 'get',
			recordSchema: 'list',
			record: 'list',
			prompt: 'list',
			memoryPolicy: 'list',
			audit: 'list',
			custom: 'request',
		};
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operationDefault = operationDefaultByResource[resource];
				if (!operationDefault) {
					throw new NodeOperationError(node, `Unsupported resource: ${resource}`, { itemIndex: i });
				}
				const operation = this.getNodeParameter('operation', i, operationDefault) as string;

				let method: IHttpRequestMethods = 'GET';
				let path = '/';
				let url = '';
				const qs: IDataObject = {};
				let body: unknown;
				const headers: IDataObject = {};
				const useGenericRequest = resource === 'custom' && operation === 'request';

				if (useGenericRequest) {
					const customMethod = String(this.getNodeParameter('requestMethod', i, customRequestDefaultMethod))
						.trim()
						.toUpperCase();
					if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(customMethod)) {
						throw new NodeOperationError(node, `Unsupported custom HTTP method: ${customMethod}`, {
							itemIndex: i,
						});
					}
					method = customMethod as IHttpRequestMethods;
					const rawPath = String(this.getNodeParameter('requestPath', i, '')).trim();
					if (!rawPath) {
						throw new NodeOperationError(node, 'Path is required for custom requests on this resource', {
							itemIndex: i,
						});
					}
					if (/^https?:\/\//i.test(rawPath)) {
						let parsedUrl: URL;
						try {
							parsedUrl = new URL(rawPath);
						} catch {
							throw new NodeOperationError(node, 'Custom request URL is invalid', { itemIndex: i });
						}

						const protocol = parsedUrl.protocol.toLowerCase();
						const hostname = parsedUrl.hostname.toLowerCase();
						if (protocol !== 'https:' || !allowedCustomRequestHosts.has(hostname)) {
							throw new NodeOperationError(
								node,
								'Custom request URL must use HTTPS and target mnexium.com',
								{ itemIndex: i },
							);
						}
						url = parsedUrl.toString();
					} else {
						path = ensurePath(rawPath);
					}
					Object.assign(
						qs,
						parseJsonObject(this.getNodeParameter('requestQueryJson', i, '{}'), 'Request Query', i, node),
					);
					Object.assign(
						headers,
						parseJsonObject(this.getNodeParameter('requestHeadersJson', i, '{}'), 'Request Headers', i, node),
					);
					if (method !== 'GET') {
						body = parseJsonObject(this.getNodeParameter('requestBodyJson', i, '{}'), 'Request Body', i, node);
					}
				} else switch (resource) {
					case 'chat': {
						method = 'POST';
						path = '/api/v1/chat/completions';
						const regenerateTrialKey = parseBooleanParam(
							this.getNodeParameter('chatRegenerateTrialKey', i, false),
						);
						const payload: IDataObject = {
							model: this.getNodeParameter('chatModel', i) as string,
						};

						const inputJson = (items[i].json || {}) as IDataObject;
						const userMessageFromParam = String(this.getNodeParameter('chatUserMessage', i, '')).trim();
						const userMessage = userMessageFromParam || extractExternalUserMessage(inputJson);
						if (!userMessage) {
							throw new NodeOperationError(
								node,
								'User Message is required (or provide incoming JSON field: message/text/input/prompt/messages)',
								{ itemIndex: i },
							);
						}
						payload.messages = [{ role: 'user', content: userMessage }];

						const mnx: IDataObject = {};
						const subjectId = (this.getNodeParameter('chatSubjectId', i, '') as string).trim();
						const chatId = (this.getNodeParameter('chatChatId', i, '') as string).trim();
						const systemPrompt = (this.getNodeParameter('chatSystemPrompt', i, '') as string).trim();
						const memoryPolicy = (this.getNodeParameter('chatMemoryPolicy', i, '') as string).trim();
						const summarize = this.getNodeParameter('chatSummarize', i, 'none') as string;

						if (subjectId) mnx.subject_id = subjectId;
						if (chatId) mnx.chat_id = chatId;
						mnx.learn = this.getNodeParameter('chatLearn', i, true) as boolean;
						mnx.history = this.getNodeParameter('chatHistory', i, true) as boolean;
						mnx.recall = this.getNodeParameter('chatRecall', i, false) as boolean;
						mnx.log = this.getNodeParameter('chatLog', i, true) as boolean;
						if (summarize !== 'none') mnx.summarize = summarize;
						if (systemPrompt) mnx.system_prompt = systemPrompt;
						if (memoryPolicy) mnx.memory_policy = memoryPolicy;
						if (regenerateTrialKey) mnx.regenerate_key = true;

						if (Object.keys(mnx).length > 0) {
							payload.mnx = mnx;
						}

						body = payload;

						setHeaderIfMissing(headers, 'x-openai-key', credentialOpenAiKey);
						setHeaderIfMissing(headers, 'x-anthropic-key', credentialAnthropicKey);
						setHeaderIfMissing(headers, 'x-google-key', credentialGoogleKey);
						break;
					}

					case 'history': {
						if (operation === 'list') {
							method = 'GET';
							path = '/api/v1/chat/history/list';
							qs.subject_id = this.getNodeParameter('historySubjectId', i) as string;
							qs.limit = this.getNodeParameter('historyListLimit', i, 50) as number;
						} else if (operation === 'read') {
							method = 'GET';
							path = '/api/v1/chat/history/read';
							qs.chat_id = this.getNodeParameter('historyChatId', i) as string;
							const subject = this.getNodeParameter('historySubjectIdOptional', i, '') as string;
							if (subject) qs.subject_id = subject;
							qs.limit = this.getNodeParameter('historyReadLimit', i, 200) as number;
						} else if (operation === 'delete') {
							method = 'DELETE';
							path = '/api/v1/chat/history/delete';
							qs.chat_id = this.getNodeParameter('historyChatId', i) as string;
							const subject = this.getNodeParameter('historySubjectIdOptional', i, '') as string;
							if (subject) qs.subject_id = subject;
						}
						break;
					}

					case 'memory': {
						if (operation === 'list') {
							path = '/api/v1/memories';
							qs.subject_id = this.getNodeParameter('memorySubjectId', i) as string;
							qs.limit = this.getNodeParameter('memoryLimit', i, 50) as number;
							qs.offset = this.getNodeParameter('memoryOffset', i, 0) as number;
						} else if (operation === 'search') {
							path = '/api/v1/memories/search';
							qs.subject_id = this.getNodeParameter('memorySubjectId', i) as string;
							qs.q = this.getNodeParameter('memorySearchText', i) as string;
							qs.limit = this.getNodeParameter('memoryLimit', i, 50) as number;
							const minScore = this.getNodeParameter('memorySearchMinScore', i, 0) as number;
							if (minScore > 0) qs.min_score = minScore;
						} else if (operation === 'create') {
							method = 'POST';
							path = '/api/v1/memories';
							const payload: IDataObject = {
								subject_id: this.getNodeParameter('memorySubjectId', i) as string,
								text: this.getNodeParameter('memoryCreateText', i) as string,
								importance: this.getNodeParameter('memoryCreateImportance', i, 75) as number,
							};
							const kind = (this.getNodeParameter('memoryCreateKind', i, '') as string).trim();
							if (kind) payload.kind = kind;
							const tags = parseJsonArray(this.getNodeParameter('memoryCreateTagsJson', i, '[]'), 'Memory Tags', i, node);
							if (tags.length > 0) payload.tags = tags;
							const metadata = parseJsonObject(
								this.getNodeParameter('memoryCreateMetadataJson', i, '{}'),
								'Memory Metadata',
								i,
								node,
							);
							if (Object.keys(metadata).length > 0) payload.metadata = metadata;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/memories/${encodeURIComponent(this.getNodeParameter('memoryId', i) as string)}`;
						} else if (operation === 'update') {
							method = 'PATCH';
							path = `/api/v1/memories/${encodeURIComponent(this.getNodeParameter('memoryId', i) as string)}`;
							const payload: IDataObject = {};
							const text = (this.getNodeParameter('memoryUpdateText', i, '') as string).trim();
							const kind = (this.getNodeParameter('memoryUpdateKind', i, '') as string).trim();
							const importance = parseOptionalNumberString(
								this.getNodeParameter('memoryUpdateImportance', i, ''),
								'Memory Importance',
								i,
								node,
							);
							const tagsCsv = (this.getNodeParameter('memoryUpdateTagsCsv', i, '') as string).trim();
							if (text) payload.text = text;
							if (kind) payload.kind = kind;
							if (importance !== undefined) payload.importance = importance;
							if (tagsCsv) {
								payload.tags = tagsCsv
									.split(',')
									.map((tag) => tag.trim())
									.filter(Boolean);
							}
							if (Object.keys(payload).length === 0) {
								throw new NodeOperationError(node, 'Provide at least one field to update (text/kind/importance/tags)', {
									itemIndex: i,
								});
							}
							body = payload;
						} else if (operation === 'delete') {
							method = 'DELETE';
							path = `/api/v1/memories/${encodeURIComponent(this.getNodeParameter('memoryId', i) as string)}`;
						} else if (operation === 'listSuperseded') {
							path = '/api/v1/memories/superseded';
							qs.subject_id = this.getNodeParameter('memorySubjectId', i) as string;
							qs.limit = this.getNodeParameter('memoryLimit', i, 50) as number;
							qs.offset = this.getNodeParameter('memoryOffset', i, 0) as number;
						} else if (operation === 'restore') {
							method = 'POST';
							path = `/api/v1/memories/${encodeURIComponent(this.getNodeParameter('memoryId', i) as string)}/restore`;
						} else if (operation === 'listRecalls') {
							path = '/api/v1/memories/recalls';
							const chatId = this.getNodeParameter('memoryRecallsChatId', i, '') as string;
							const memoryId = this.getNodeParameter('memoryRecallsMemoryId', i, '') as string;
							if (chatId) qs.chat_id = chatId;
							if (memoryId) qs.memory_id = memoryId;
							if (!chatId && !memoryId) {
								throw new NodeOperationError(node, 'Provide Recall Chat ID or Recall Memory ID', { itemIndex: i });
							}
							qs.limit = this.getNodeParameter('memoryLimit', i, 50) as number;
							if (memoryId) {
								const stats = this.getNodeParameter('memoryRecallsStats', i, false) as boolean;
								if (stats) qs.stats = true;
							}
						} else if (operation === 'getClaims') {
							path = `/api/v1/memories/${encodeURIComponent(this.getNodeParameter('memoryId', i) as string)}/claims`;
						}
						break;
					}

					case 'claim': {
						if (operation === 'create') {
							method = 'POST';
							path = '/api/v1/claims';
							const payload: IDataObject = {
								subject_id: this.getNodeParameter('claimCreateSubjectId', i) as string,
								predicate: this.getNodeParameter('claimCreatePredicate', i) as string,
								object_value: this.getNodeParameter('claimCreateObjectValue', i) as string,
							};
							const claimType = (this.getNodeParameter('claimCreateType', i, '') as string).trim();
							const confidence = parseOptionalNumberString(
								this.getNodeParameter('claimCreateConfidence', i, ''),
								'Claim Confidence',
								i,
								node,
							);
							const importance = parseOptionalNumberString(
								this.getNodeParameter('claimCreateImportance', i, ''),
								'Claim Importance',
								i,
								node,
							);
							const sourceText = (this.getNodeParameter('claimCreateSourceText', i, '') as string).trim();
							const tags = parseJsonArray(this.getNodeParameter('claimCreateTagsJson', i, '[]'), 'Claim Tags', i, node);
							if (claimType) payload.claim_type = claimType;
							if (confidence !== undefined) payload.confidence = confidence;
							if (importance !== undefined) payload.importance = importance;
							if (sourceText) payload.source_text = sourceText;
							if (tags.length > 0) payload.tags = tags;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/claims/${encodeURIComponent(this.getNodeParameter('claimId', i) as string)}`;
						} else if (operation === 'retract') {
							method = 'POST';
							path = `/api/v1/claims/${encodeURIComponent(this.getNodeParameter('claimId', i) as string)}/retract`;
							const reason = (this.getNodeParameter('claimRetractReason', i, '') as string).trim();
							if (reason) body = { reason };
						} else if (operation === 'getTruth') {
							path = `/api/v1/claims/subject/${encodeURIComponent(this.getNodeParameter('claimSubjectId', i) as string)}/truth`;
							qs.include_source = this.getNodeParameter('claimIncludeSource', i, true) as boolean;
						} else if (operation === 'getSlot') {
							path = `/api/v1/claims/subject/${encodeURIComponent(this.getNodeParameter('claimSubjectId', i) as string)}/slot/${encodeURIComponent(this.getNodeParameter('claimSlot', i) as string)}`;
						} else if (operation === 'listSlots') {
							path = `/api/v1/claims/subject/${encodeURIComponent(this.getNodeParameter('claimSubjectId', i) as string)}/slots`;
							qs.limit = this.getNodeParameter('claimLimit', i, 100) as number;
						} else if (operation === 'getGraph') {
							path = `/api/v1/claims/subject/${encodeURIComponent(this.getNodeParameter('claimSubjectId', i) as string)}/graph`;
							qs.limit = this.getNodeParameter('claimLimit', i, 100) as number;
						} else if (operation === 'getHistory') {
							path = `/api/v1/claims/subject/${encodeURIComponent(this.getNodeParameter('claimSubjectId', i) as string)}/history`;
							qs.limit = this.getNodeParameter('claimLimit', i, 100) as number;
							const slot = (this.getNodeParameter('claimHistorySlot', i, '') as string).trim();
							if (slot) qs.slot = slot;
						}
						break;
					}

					case 'profile': {
						if (operation === 'get') {
							path = '/api/v1/profiles';
							qs.subject_id = this.getNodeParameter('profileSubjectId', i) as string;
							qs.format = this.getNodeParameter('profileGetFormat', i, 'simple') as string;
						} else if (operation === 'getSchema') {
							path = '/api/v1/profiles/schema';
						} else if (operation === 'update') {
							method = 'PATCH';
							path = '/api/v1/profiles';
							const updates = parseJsonArray(this.getNodeParameter('profileUpdatesJson', i), 'Profile Updates', i, node);
							if (updates.length === 0) {
								throw new NodeOperationError(node, 'Updates must include at least one item', { itemIndex: i });
							}
							body = {
								subject_id: this.getNodeParameter('profileUpdateSubjectId', i) as string,
								updates,
							};
						} else if (operation === 'deleteField') {
							method = 'DELETE';
							path = '/api/v1/profiles';
							qs.subject_id = this.getNodeParameter('profileSubjectId', i) as string;
							qs.field_key = this.getNodeParameter('profileFieldKey', i) as string;
						}
						break;
					}

					case 'state': {
						path = `/api/v1/state/${encodeURIComponent(this.getNodeParameter('stateKey', i) as string)}`;
						setHeaderIfValue(headers, 'x-subject-id', this.getNodeParameter('stateSubjectHeader', i) as string);
						setHeaderIfValue(headers, 'x-session-id', this.getNodeParameter('stateSessionHeader', i, '') as string);

						if (operation === 'set') {
							method = 'PUT';
							const value = parseJsonObject(this.getNodeParameter('stateValueJson', i), 'State Value', i, node);
							const payload: IDataObject = { value };
							const ttlSeconds = parseOptionalNumberString(
								this.getNodeParameter('stateTtlSeconds', i, ''),
								'TTL Seconds',
								i,
								node,
							);
							if (ttlSeconds !== undefined) payload.ttl_seconds = ttlSeconds;
							body = payload;
						} else if (operation === 'delete') {
							method = 'DELETE';
						}
						break;
					}

					case 'recordSchema': {
						if (operation === 'list') {
							path = '/api/v1/records/schemas';
						} else if (operation === 'createOrUpdate') {
							method = 'POST';
							path = '/api/v1/records/schemas';
							const payload: IDataObject = {
								type_name: this.getNodeParameter('recordSchemaTypeName', i) as string,
								fields: parseJsonObject(this.getNodeParameter('recordSchemaFieldsJson', i), 'Record Schema Fields', i, node),
							};
							const displayName = (this.getNodeParameter('recordSchemaDisplayName', i, '') as string).trim();
							const description = (this.getNodeParameter('recordSchemaDescription', i, '') as string).trim();
							if (displayName) payload.display_name = displayName;
							if (description) payload.description = description;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/records/schemas/${encodeURIComponent(this.getNodeParameter('recordSchemaType', i) as string)}`;
						}
						break;
					}

					case 'record': {
						const type = encodeURIComponent(this.getNodeParameter('recordType', i) as string);
						setHeaderIfValue(headers, 'x-subject-id', this.getNodeParameter('recordSubjectHeader', i, '') as string);

						if (operation === 'list') {
							path = `/api/v1/records/${type}`;
							qs.limit = this.getNodeParameter('recordListLimit', i, 50) as number;
							qs.offset = this.getNodeParameter('recordListOffset', i, 0) as number;
						} else if (operation === 'create') {
							method = 'POST';
							path = `/api/v1/records/${type}`;
							const payload: IDataObject = {
								data: parseJsonObject(this.getNodeParameter('recordCreateDataJson', i), 'Record Create Data', i, node),
							};
							const ownerId = (this.getNodeParameter('recordCreateOwnerId', i, '') as string).trim();
							if (ownerId) payload.owner_id = ownerId;
							payload.visibility = this.getNodeParameter('recordCreateVisibility', i, 'public') as string;
							const collaborators = parseJsonArray(
								this.getNodeParameter('recordCreateCollaboratorsJson', i, '[]'),
								'Record Collaborators',
								i,
								node,
							);
							if (collaborators.length > 0) payload.collaborators = collaborators;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/records/${type}/${encodeURIComponent(this.getNodeParameter('recordId', i) as string)}`;
						} else if (operation === 'update') {
							method = 'PUT';
							path = `/api/v1/records/${type}/${encodeURIComponent(this.getNodeParameter('recordId', i) as string)}`;
							body = {
								data: parseJsonObject(this.getNodeParameter('recordUpdateDataJson', i), 'Record Update Data', i, node),
							};
						} else if (operation === 'delete') {
							method = 'DELETE';
							path = `/api/v1/records/${type}/${encodeURIComponent(this.getNodeParameter('recordId', i) as string)}`;
						} else if (operation === 'query') {
							method = 'POST';
							path = `/api/v1/records/${type}/query`;
							const payload: IDataObject = {
								limit: this.getNodeParameter('recordQueryLimit', i, 50) as number,
								offset: this.getNodeParameter('recordQueryOffset', i, 0) as number,
							};
							const where = parseJsonObject(this.getNodeParameter('recordQueryWhereJson', i, '{}'), 'Record Query Where', i, node);
							if (Object.keys(where).length > 0) payload.where = where;
							const orderBy = (this.getNodeParameter('recordQueryOrderBy', i, '') as string).trim();
							if (orderBy) payload.order_by = orderBy;
							body = payload;
						} else if (operation === 'search') {
							method = 'POST';
							path = `/api/v1/records/${type}/search`;
							body = {
								query: this.getNodeParameter('recordSearchQuery', i) as string,
								limit: this.getNodeParameter('recordSearchLimit', i, 10) as number,
							};
						}
						break;
					}

					case 'prompt': {
						if (operation === 'list') {
							path = '/api/v1/prompts';
						} else if (operation === 'create') {
							method = 'POST';
							path = '/api/v1/prompts';
							const payload: IDataObject = {
								name: this.getNodeParameter('promptCreateName', i) as string,
								prompt_text: this.getNodeParameter('promptCreateText', i) as string,
								scope: this.getNodeParameter('promptCreateScope', i, 'project') as string,
								is_default: this.getNodeParameter('promptCreateIsDefault', i, false) as boolean,
								priority: this.getNodeParameter('promptCreatePriority', i, 100) as number,
							};
							const scopeId = (this.getNodeParameter('promptCreateScopeId', i, '') as string).trim();
							if (scopeId) payload.scope_id = scopeId;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/prompts/${encodeURIComponent(this.getNodeParameter('promptId', i) as string)}`;
						} else if (operation === 'update') {
							method = 'PATCH';
							path = `/api/v1/prompts/${encodeURIComponent(this.getNodeParameter('promptId', i) as string)}`;
							const payload: IDataObject = {};
							const name = (this.getNodeParameter('promptUpdateName', i, '') as string).trim();
							const text = (this.getNodeParameter('promptUpdateText', i, '') as string).trim();
							const isDefault = parseTriStateBoolean(this.getNodeParameter('promptUpdateIsDefaultMode', i, 'omit'));
							const isActive = parseTriStateBoolean(this.getNodeParameter('promptUpdateIsActiveMode', i, 'omit'));
							const priority = parseOptionalNumberString(
								this.getNodeParameter('promptUpdatePriority', i, ''),
								'Prompt Priority',
								i,
								node,
							);
							if (name) payload.name = name;
							if (text) payload.prompt_text = text;
							if (isDefault !== undefined) payload.is_default = isDefault;
							if (isActive !== undefined) payload.is_active = isActive;
							if (priority !== undefined) payload.priority = priority;
							if (Object.keys(payload).length === 0) {
								throw new NodeOperationError(node, 'Provide at least one field to update for prompt', { itemIndex: i });
							}
							body = payload;
						} else if (operation === 'delete') {
							method = 'DELETE';
							path = `/api/v1/prompts/${encodeURIComponent(this.getNodeParameter('promptId', i) as string)}`;
						} else if (operation === 'resolve') {
							path = '/api/v1/prompts/resolve';
							const subjectId = this.getNodeParameter('promptResolveSubjectId', i, '') as string;
							const chatId = this.getNodeParameter('promptResolveChatId', i, '') as string;
							if (subjectId) qs.subject_id = subjectId;
							if (chatId) qs.chat_id = chatId;
							qs.combined = this.getNodeParameter('promptResolveCombined', i, false) as boolean;
							qs.default_only = this.getNodeParameter('promptResolveDefaultOnly', i, false) as boolean;
						}
						break;
					}

					case 'memoryPolicy': {
						if (operation === 'list') {
							path = '/api/v1/memory/policies';
						} else if (operation === 'create') {
							method = 'POST';
							path = '/api/v1/memory/policies';
							const payload: IDataObject = {
								name: this.getNodeParameter('policyCreateName', i) as string,
								policy_text: this.getNodeParameter('policyCreateText', i) as string,
								scope: this.getNodeParameter('policyCreateScope', i, 'project') as string,
								is_default: this.getNodeParameter('policyCreateIsDefault', i, false) as boolean,
								priority: this.getNodeParameter('policyCreatePriority', i, 100) as number,
							};
							const scopeId = (this.getNodeParameter('policyCreateScopeId', i, '') as string).trim();
							if (scopeId) payload.scope_id = scopeId;
							const config = parseJsonObject(
								this.getNodeParameter('policyCreateConfigJson', i, '{}'),
								'Policy Config',
								i,
								node,
							);
							if (Object.keys(config).length > 0) payload.config = config;
							body = payload;
						} else if (operation === 'get') {
							path = `/api/v1/memory/policies/${encodeURIComponent(this.getNodeParameter('policyId', i) as string)}`;
						} else if (operation === 'update') {
							method = 'PATCH';
							path = `/api/v1/memory/policies/${encodeURIComponent(this.getNodeParameter('policyId', i) as string)}`;
							const payload: IDataObject = {};
							const name = (this.getNodeParameter('policyUpdateName', i, '') as string).trim();
							const text = (this.getNodeParameter('policyUpdateText', i, '') as string).trim();
							const isDefault = parseTriStateBoolean(this.getNodeParameter('policyUpdateIsDefaultMode', i, 'omit'));
							const isActive = parseTriStateBoolean(this.getNodeParameter('policyUpdateIsActiveMode', i, 'omit'));
							const priority = parseOptionalNumberString(
								this.getNodeParameter('policyUpdatePriority', i, ''),
								'Policy Priority',
								i,
								node,
							);
							if (name) payload.name = name;
							if (text) payload.policy_text = text;
							if (isDefault !== undefined) payload.is_default = isDefault;
							if (isActive !== undefined) payload.is_active = isActive;
							if (priority !== undefined) payload.priority = priority;
							if (Object.keys(payload).length === 0) {
								throw new NodeOperationError(node, 'Provide at least one field to update for memory policy', {
									itemIndex: i,
								});
							}
							body = payload;
						} else if (operation === 'delete') {
							method = 'DELETE';
							path = `/api/v1/memory/policies/${encodeURIComponent(this.getNodeParameter('policyId', i) as string)}`;
						} else if (operation === 'resolve') {
							path = '/api/v1/memory/policies/resolve';
							const subjectId = this.getNodeParameter('policyResolveSubjectId', i, '') as string;
							const chatId = this.getNodeParameter('policyResolveChatId', i, '') as string;
							if (subjectId) qs.subject_id = subjectId;
							if (chatId) qs.chat_id = chatId;
							qs.combined = this.getNodeParameter('policyResolveCombined', i, false) as boolean;
							qs.default_only = this.getNodeParameter('policyResolveDefaultOnly', i, false) as boolean;
						}
						break;
					}

					case 'audit': {
						path = '/api/v1/audit/requests';
						const auditId = (this.getNodeParameter('auditId', i, '') as string).trim();
						const chatId = (this.getNodeParameter('auditChatId', i, '') as string).trim();
						const subjectId = (this.getNodeParameter('auditSubjectId', i, '') as string).trim();
						const direction = this.getNodeParameter('auditDirection', i, 'any') as string;
						const requestType = this.getNodeParameter('auditRequestType', i, 'any') as string;
						if (auditId) qs.audit_id = auditId;
						if (chatId) qs.chat_id = chatId;
						if (subjectId) qs.subject_id = subjectId;
						if (direction !== 'any') qs.direction = direction;
						if (requestType !== 'any') qs.request_type = requestType;
						qs.limit = this.getNodeParameter('auditLimit', i, 100) as number;
						qs.offset = this.getNodeParameter('auditOffset', i, 0) as number;
						break;
					}

					case 'custom': {
						break;
					}

					default:
						throw new NodeOperationError(node, `Unsupported resource: ${resource}`, { itemIndex: i });
				}

				const requestOptions: IHttpRequestOptions = {
					method,
					url: url || `${baseUrl}${path}`,
					json: true,
				};

				if (credentialApiKey && !hasHeader(headers, 'x-mnexium-key') && !hasHeader(headers, 'authorization')) {
					headers['x-mnexium-key'] = credentialApiKey;
				}

				if (Object.keys(qs).length > 0) {
					requestOptions.qs = qs;
				}

				if (Object.keys(headers).length > 0) {
					requestOptions.headers = headers;
				}

				if (body !== undefined && method !== 'GET') {
					requestOptions.body = body as IHttpRequestOptions['body'];
				}

				const responseData = await this.helpers.httpRequest(requestOptions);

				if (Array.isArray(responseData)) {
					returnData.push({
						json: { data: responseData },
						pairedItem: { item: i },
					});
				} else if (responseData !== null && typeof responseData === 'object') {
					returnData.push({
						json: responseData as IDataObject,
						pairedItem: { item: i },
					});
				} else {
					returnData.push({
						json: { data: responseData as unknown as string },
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
