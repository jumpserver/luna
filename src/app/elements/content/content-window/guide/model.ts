export interface InfoItem {
  name: string;
  value: string;
  label: any;
}

export interface Command {
  title: string;
  value: string;
  safeValue: string;
  helpText: string;
  callClient: boolean;
}
