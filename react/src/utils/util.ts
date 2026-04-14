import { gasGetActiveSheetName } from "../lib/gas"
import type { StatusVariant } from "../lib/useSpecSocket"

export async function isSheetSwitch(expectedSheetName: string): Promise<boolean> {
	const name = String((await gasGetActiveSheetName()) || '').trim()
	return !!(name && name !== expectedSheetName)
}

export function statusVariantClass(v: StatusVariant): string {
	switch (v) {
		case 'connecting':
			return 'is-connecting'
		case 'connected':
			return 'is-connected'
		case 'warning':
			return 'is-warning'
		case 'error':
			return 'is-error'
		default:
			return 'is-connecting'
	}
}