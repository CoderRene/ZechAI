import type { StatusVariant } from "../../lib/useSpecSocket";
import { statusVariantClass } from "../../utils/util";
import "./ConnectionStatus.css";

interface ConnectionStatusProps {
    status: StatusVariant;
    message: string;
}

export default function ConnectionStatus(props: ConnectionStatusProps) {

    const { status, message } = props;

    return (
        <div
            id="status"
            className={statusVariantClass(status)}
            role="status"
            aria-live="polite"
        >
            {message}
        </div>
    )
}