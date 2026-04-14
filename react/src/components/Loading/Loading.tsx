import "./Loading.css";

export default function Loading() {

    return (
        <div
            className="setup-loading"
            role="status"
            aria-live="polite"
            aria-label="Loading setup UI"
        >
            <div className="spinner" aria-hidden="true" />
            <span className="setup-loading-text">Loading...</span>
        </div>
    )
}