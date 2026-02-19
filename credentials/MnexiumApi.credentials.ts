import type {
	IAuthenticateGeneric,
	ICredentialType,
	ICredentialTestRequest,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class MnexiumApi implements ICredentialType {
	name = 'mnexiumApi';
	displayName = 'Mnexium API + Model Keys';
	icon: Icon = 'fa:shield-alt';
	documentationUrl = 'https://www.mnexium.com/docs';
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: 'https://www.mnexium.com/api/v1/memory/policies',
		},
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Mnexium API Key (Optional for Free Tier)',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: false,
			placeholder: 'Leave blank for free tier, or paste key from mnexium.com',
			description:
				'Get a key at https://www.mnexium.com. Leave empty to use free-tier trial provisioning when available.',
		},
		{
			displayName: 'OpenAI API Key',
			name: 'openAiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'sk-... (required for OpenAI models)',
			description: 'Optional. Used as x-openai-key for chat models.',
		},
		{
			displayName: 'Anthropic API Key',
			name: 'anthropicKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'sk-ant-... (required for Anthropic models)',
			description: 'Optional. Used as x-anthropic-key for chat models.',
		},
		{
			displayName: 'Google API Key',
			name: 'googleKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'AIza... (required for Google models)',
			description: 'Optional. Used as x-google-key for chat models.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-mnexium-key': '={{$credentials.apiKey}}',
			},
		},
	};
}
