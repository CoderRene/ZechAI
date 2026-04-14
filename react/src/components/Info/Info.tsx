import type { ReactNode } from "react";
import "./Info.css";

export interface InfoProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
	title?: string;
	children?: ReactNode;
}

export default function Info(props: InfoProps) {
	const { title, children } = props;

	if (title == null && (children == null || children === false)) {
		return null;
	}

	const label = title ?? (typeof children === "string" ? children : "Information");

	return (
		<aside
			className="app-info"
			role="note"
			aria-label={label}
		>
			<div className="app-info-body">
				{title != null ? (
					<div className="app-info-title">{title}</div>
				) : null}
				{children != null && children !== false ? (
					<div className="app-info-content">{children}</div>
				) : null}
			</div>
		</aside>
	);
}
