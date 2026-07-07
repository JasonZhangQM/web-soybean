import type { CreateAxiosDefaults } from 'axios';
import type { IAxiosRetryConfig } from 'axios-retry';
import { stringify } from 'qs';
import { isHttpSuccess } from './shared';
import type { RequestOption } from './type';

export function createDefaultOptions<
  ResponseData,
  ApiData = ResponseData,
  State extends Record<string, unknown> = Record<string, unknown>
>(options?: Partial<RequestOption<ResponseData, ApiData, State>>) {
  const opts: RequestOption<ResponseData, ApiData, State> = {
    defaultState: {} as State,
    transform: async response => response.data as unknown as ApiData,
    transformBackendResponse: async response => response.data as unknown as ApiData,
    onRequest: async config => config,
    isBackendSuccess: _response => true,
    onBackendFail: async () => {},
    onError: async () => {}
  };

  if (options?.transform) {
    opts.transform = options.transform;
  } else {
    opts.transform = options?.transformBackendResponse || opts.transform;
  }

  Object.assign(opts, options);

  return opts;
}

export function createRetryOptions(config?: Partial<CreateAxiosDefaults>) {
  const retryConfig: IAxiosRetryConfig = {
    retries: 0
  };

  Object.assign(retryConfig, config);

  return retryConfig;
}

export function createAxiosConfig(config?: Partial<CreateAxiosDefaults>) {
  const TEN_SECONDS = 10 * 1000;

  const axiosConfig: CreateAxiosDefaults = {
    timeout: TEN_SECONDS,
    headers: {
      'Content-Type': 'application/json'
    },
    validateStatus: isHttpSuccess,
    paramsSerializer: params => {
      // arrayFormat: 'repeat' 将数组序列化为重复键（如 category=a&category=b），
      // 兼容 FastAPI Query(List[str]) 的多值参数解析
      return stringify(params, { arrayFormat: 'repeat' });
    }
  };

  Object.assign(axiosConfig, config);

  return axiosConfig;
}
