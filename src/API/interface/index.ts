export interface Result {
  code?: string;
  msg?: string;
}

export interface ResultData<T = any> extends Result {
  data: T;
}
