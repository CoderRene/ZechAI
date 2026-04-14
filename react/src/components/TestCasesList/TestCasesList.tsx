import type { TestCase } from "../../pages/TestCases";
import "./TestCasesList.css";

interface TestCasesListProps {
	testCases: TestCase[];
	isInsertBusy: boolean;
	onTestCaseInsert: (testCase: TestCase) => void;
}

const MOCK_MODE = false;

export default function TestCasesList(props: TestCasesListProps) {

	const { testCases, isInsertBusy, onTestCaseInsert } = props;

	return (
		<section className="tcl-root" aria-label="Test cases">
			<header className="tcl-header">
				<div className="tcl-title">Test cases</div>
				<div className="tcl-count" aria-label={`${testCases.length} test cases`}>
					{testCases.length}
				</div>
			</header>

			{(testCases.length === 0 && !MOCK_MODE) ? (
				<div className="tcl-empty">
					<div className="tcl-empty-title">No test cases yet</div>
					<div className="tcl-empty-subtitle">
						Click <span className="tcl-inline-chip">Generate ✦</span> to create them from your selected
						requirement.
					</div>
				</div>
			) : (
				<ol className="tcl-list">
					{(MOCK_MODE ? [{case: "Case 1", expected: "Expectation"}] : testCases).map((testCase, idx) => (
						<li className="tcl-card" key={`${idx}-${testCase.case}`}>
							<div className="tcl-card-header">
								<div className="tcl-card-title">Test Case {idx + 1}</div>
								<div className="tcl-badge">Expected</div>
							</div>

							<div className="tcl-block">
								<div className="tcl-label">Case</div>
								<div className="tcl-value">{testCase.case}</div>
							</div>

							<div className="tcl-divider" role="presentation" />

							<div className="tcl-block tcl-block-expected">
								<div className="tcl-label">Expected result</div>
								<div className="tcl-value">{testCase.expected}</div>
							</div>

							<button 
								className="tcl-insert-btn" 
								type="button"
								onClick={() => onTestCaseInsert(testCase)}
								disabled={isInsertBusy}
							>
								Insert Test Case
							</button>
						</li>
					))}
				</ol>
			)}
		</section>
	)
}