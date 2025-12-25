declare module 'redis';
declare module 'bull';

// Third-party packages without bundled type declarations
declare module 'debug';
declare module 'node-fetch';

declare module 'telegraf' {
	const Telegraf: any;
	const Markup: any;
	type Context = any;
	export { Telegraf, Context, Markup };
	export default Telegraf;
}
