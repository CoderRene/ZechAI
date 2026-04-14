import "./EnhanceText.css";

interface EnhanceTextProps {
    blurHidden: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    enhanceText: string;
}

export default function EnhanceText(props: EnhanceTextProps) {

    const { blurHidden, enhanceText, scrollRef } = props;

    return (
        <div className="enh-root-container">
            <div className={`enh-blur-container${blurHidden ? ' disable' : ''}`} aria-hidden="true" />

            <div className="scroll-container" ref={scrollRef}>
                <p id="enhance-txt">{enhanceText}</p>
                <div className="scroll-anchor" />
            </div>
        </div>
    )
}