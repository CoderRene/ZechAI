import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ConnectionStatus from "../components/ConnectionStatus/ConnectionStatus"
import EnhanceText from "../components/EnhanceText/EnhanceText"
import ErrorView from "../components/Error/Error"
import Loading from "../components/Loading/Loading"
import SetupRow from "../components/SetupRow/SetupRow"
import TestCasesList from "../components/TestCasesList/TestCasesList"
import { resolveWsSpecUrl } from "../lib/clientEnv"
import { gasGetActiveSelection, gasGetRows, gasGetValues, gasReadCell, gasShowSidebar, gasWriteCell } from "../lib/gas"
import { safeLoadSelectedHeaders, safePersistSelectedHeaders, selectedHeadersStorageKey, type TrackedHeader } from "../lib/selectedHeadersStorage"
import { newSessionId } from "../lib/session"
import { AgentLimitReachedError, useSpecSocket } from "../lib/useSpecSocket"
import { isSheetSwitch } from "../utils/util"
import './main.css'

const colHeaders = ['test case', 'expected results']
const USER_ID = 'api-user'

const DEFAULT_ENHANCE_TXT = 'Click "Generate" to generate test cases for the selected requirement'

export type TestCase = {
	case: string;
	expected: string;
}

export default function TestCases() {
	const wsUrl = resolveWsSpecUrl()
	const sheetName = (document.body?.dataset?.sheetName ?? '').trim()
	const storageKey = useMemo(() => selectedHeadersStorageKey(wsUrl, sheetName), [wsUrl, sheetName])

	const scrollRef = useRef<HTMLDivElement>(null)

	const [headers, setHeaders] = useState<TrackedHeader[]>([]);

	const [phase, setPhase] = useState<'loading' | 'row' | 'error' | 'main'>('loading')
	const [errorMsg, setErrorMsg] = useState('No error');
	const [sheetRows, setSheetRows] = useState<number[]>([])

	const [enhanceBusy, setEnhanceBusy] = useState(false)
	const [insertBusy, setInsertBusy] = useState(false);
	const [blurHidden, setBlurHidden] = useState(true)

	const [enhanceTxt, setEnhanceTxt] = useState(DEFAULT_ENHANCE_TXT)
	const [testCases, setTestCases] = useState<TestCase[]>([])

	const { status: socketStatus, setStatusMessage, sendGenerateSpecOverSocket } = useSpecSocket(wsUrl)

	const loadMainEntry = useCallback(async () => {
		setPhase('loading')
		try {
			const rows = await gasGetRows()
			setSheetRows(rows)
			const loaded = safeLoadSelectedHeaders(storageKey)
			if (loaded.length > 0) {
				setHeaders(loaded)
				setPhase('main')
			} else {
				setPhase('row')
			}
		} catch (err: unknown) {
			const msg = err instanceof globalThis.Error ? err.message : String(err)
			setStatusMessage(msg, 'error')
			setPhase('row')
		}
	}, [storageKey, setStatusMessage])

	useEffect(() => {
		void loadMainEntry()
	}, [loadMainEntry])

	const persistHeaders = useCallback(
		(headers: TrackedHeader[]) => {
			safePersistSelectedHeaders(storageKey, sheetName, headers)
		},
		[storageKey, sheetName]
	)

	const handleSelectRow = useCallback(
		async (row: number) => {
			try {
				setPhase('loading');
				const rowValues = await gasGetValues(`${row}:${row}`);
				// check if the result has colHeaders
				const foundColHeaders: TrackedHeader[] = [];
				rowValues[0].forEach((header, index) => {
					const isExist = colHeaders.some(column => column.localeCompare(header.toLocaleLowerCase()) == 0 ? true : false);
					if (isExist) {
						foundColHeaders.push({ header, index: String(index) });
					}
				});

				if (foundColHeaders.length !== colHeaders.length) {
					setPhase('error');
					setErrorMsg('Please ensure that there are Test Case and Expected Result columns');
					return;
				}

				persistHeaders(foundColHeaders);
				setHeaders(foundColHeaders);
				setPhase('main');

			} catch (err) {
				const msg = err instanceof globalThis.Error ? err.message : String(err);
				setStatusMessage(msg, 'error');
			}
		},
		[setStatusMessage, setPhase]
	)

	const handleGenerate = async () => {
		setEnhanceBusy(true);
		setTestCases([]);
		setEnhanceTxt('Validating sheet...');

		let succeed = false;

		try {
			const switched = await isSheetSwitch(sheetName)
			if (switched) {
				setPhase('error')
				setErrorMsg("You have switched a sheet.. refreshing...")
				setEnhanceBusy(false)
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
				gasShowSidebar()
				return
			}

			setEnhanceTxt('Reading selected cell...')

			const activeSelection = await gasGetActiveSelection()
			if (!activeSelection) {
				setEnhanceTxt('No active selection.')
				setEnhanceBusy(false)
				setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
				return
			}

			const _1Based = activeSelection._1Based
			const cols: string[] = []
			for (let col = _1Based.c1; col <= _1Based.c2; col++) {
				cols.push(String(col))
			}
			if (cols.length > 1) {
				setEnhanceTxt("Oops! You can only select 1 column at a time")
				setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
				return;
			}

			const rows: number[] = []
			for (let row = _1Based.r1; row <= _1Based.r2; row++) {
				rows.push(row)
			}
			if (rows.length > 1) {
				setEnhanceTxt("Oops! You can only select 1 row at a time")
				setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
				return;
			}

			const readCell = (row: number, col: string) => gasReadCell(row, Number(col))

			const requirement = await readCell(rows[0], cols[0]);

			if (requirement.trim() === '') {
				setEnhanceTxt("Cell is empty!")
				setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
				return;
			}

			setBlurHidden(true)
			setEnhanceTxt('Processing prompt...')

			const result = await sendGenerateSpecOverSocket('testcase', requirement, USER_ID, newSessionId(), {
				onChunk: (text) => {
					setEnhanceTxt(text)
					const el = scrollRef.current
					if (el) el.scrollTop = el.scrollHeight
				},
				onFirstStreamChunk: () => setBlurHidden(false),
			})

			setBlurHidden(true)
			setEnhanceTxt('Writing test cases...')

			const chunkedCases = result?.split("===")
			const cases: TestCase[] = []

			for (const c of chunkedCases || []) {
				const chunks = c.trim().split("- ");

				if (chunks.length < 1) {
					continue;
				}

				cases.push({
					case: chunks[1].trim(),
					expected: chunks[2].replace("Expected Result:", "").trim()
				})
			}

			succeed = true;
			setTestCases(cases)

		} catch (err) {
			if (err instanceof AgentLimitReachedError) {
				const retryHint =
					err.retryAfterSeconds !== null
						? ` Please retry in ${Math.ceil(err.retryAfterSeconds)}s.`
						: ''
				setStatusMessage(`Agent limit reached.${retryHint}`, 'warning')
				setEnhanceTxt(`${err.message}${retryHint}`)
			} else {
				const msg = err instanceof Error ? err.message : String(err)
				setEnhanceTxt(msg)
			}
			setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
		} finally {
			setEnhanceBusy(false)
			if (succeed)
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
		}
	}

	const handleOnInsertTestCase = async (testCase: TestCase) => {
		const writeCell = async (row: number, col: number, value: string) => await gasWriteCell(row, col, 1, 1, value)
		setInsertBusy(true)
		setEnhanceTxt("Inserting to the selected row...")

		const activeSelection = await gasGetActiveSelection()
		if (!activeSelection) {
			setEnhanceTxt('No active selection.')
			setEnhanceBusy(false)
			return
		}

		const _1Based = activeSelection._1Based

		const rows: number[] = []
		for (let row = _1Based.r1; row <= _1Based.r2; row++) {
			rows.push(row)
		}
		if (rows.length > 1) {
			setEnhanceTxt("Oops! You can only select 1 row at a time")
			return;
		}

		for (const row of rows) {
			for (const header of headers) {
				const value = header.header.toLocaleLowerCase() === 'test case' ? testCase.case : testCase.expected;
				await writeCell(row, Number(header.index) + 1, value)
			}
		}

		setEnhanceTxt(DEFAULT_ENHANCE_TXT)
		setInsertBusy(false)
	}

	return (
		<div className="home">
			<ConnectionStatus
				status={socketStatus.variant}
				message={socketStatus.message}
			/>

			{/* SETUP UI SECTION */}
			{phase !== 'main' && (
				<div id="setup-sect">
					{phase === 'loading' && (
						<Loading />
					)}

					{/* when the user is selecting a row to be a header */}
					{phase === 'row' && (
						<>
							<label className="setup-row-phase-desc" id="setup-desc">
								Select a row to be a header:
							</label>
							<SetupRow rows={sheetRows} onSelectRow={handleSelectRow} />
						</>
					)}
				</div>
			)}

			{/* MAIN UI SECTION */}
			{phase === 'main' && (
				<div id="content-sect">

					<EnhanceText
						scrollRef={scrollRef}
						blurHidden={blurHidden}
						enhanceText={enhanceTxt}
					/>

					<button
						id="enhance-btn"
						className={`btn-block${enhanceBusy ? ' is-loading' : ''}`}
						type="button"
						disabled={enhanceBusy}
						onClick={() => void handleGenerate()}
					>
						Generate ✦
					</button>

					<TestCasesList
						isInsertBusy={insertBusy}
						testCases={testCases}
						onTestCaseInsert={handleOnInsertTestCase}
					/>
				</div>
			)}

			{/* ERROR */}
			{phase === 'error' && (
				<ErrorView
					errorMsg={errorMsg}
				/>
			)}
		</div>
	)
}