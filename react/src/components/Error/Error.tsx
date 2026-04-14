import "./Error.css";

interface ErrorProps {
    errorMsg: string;
}

export default function Error(props: ErrorProps) {

    const { errorMsg } = props;

    return (
        <div
            className="container"
            role="status"
            aria-live="polite"
            aria-label="Error"
        >
            <span className="error-text">{errorMsg}</span>
        </div>
    )
}