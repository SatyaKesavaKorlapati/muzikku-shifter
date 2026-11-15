export {};

declare global {
  interface Window {
    MusicKit?: {
      configure: (config: {
        developerToken: string;
        app: { name: string; build: string };
      }) => Promise<void> | void;
      getInstance: () => {
        authorize: () => Promise<string>;
        musicUserToken?: string;
      };
    };
  }

  var __muzikkuScheduler: ReturnType<typeof setInterval> | undefined;
  var __muzikkuDemo: unknown;
  var __muzikkuPrisma: unknown;
}
