import React, { useState, useEffect } from 'react';
import AnimatedMarkdown from '../src/components/AnimatedMarkdown';
import '../src/styles.css';
import Controls from './Controls';

interface RandomTextSenderProps {
    initialText: string;
    windowSize: number;  // Propagate this to SmoothText for consistency
    animation?: string;  // Animation name
    sep?: string;  // Token separator
    customComponents: { [key: string]: ({ content }: { content: string }) => React.ReactNode };
    htmlComponents?: { [key: string]: ({ content }: { content: string }) => React.ReactNode };
}

const RandomTextSender: React.FC<RandomTextSenderProps> = ({ initialText, customComponents, htmlComponents={} }) => {
    const [currentText, setCurrentText] = useState('');
    const [remainingTokens, setRemainingTokens] = useState<string[]>([]);
    const [baseLatency, setBaseLatency] = useState<number>(10);
    const [tokenCount, setTokenCount] = useState<number>(0);
    const [controls, setControls] = useState({
        animation: "fadeIn",
        sep: "word",
        windowSize: 5,
        delayMultiplier: 1.4,
        animationDuration: 0.6,
        animationTimingFunction: "ease-in-out",
        generationSpeed: 3,
        simulateNetworkIssue: false
    });
    const [slowSection, setSlowSection] = useState<boolean>(false);
    const [numId, setNumId] = useState<number>(0);
    // console.log('Controls:', controls);
    useEffect(() => {
        let extra = 0;
        if (tokenCount > 0 && tokenCount % 5 === 0 && controls.simulateNetworkIssue) {
            extra = (Math.random() > 0.5 ? 400 : 0); // Randomly choose between 200ms and 800m
        }
        const newBaseLatency = 1000 / controls.generationSpeed + extra
        setBaseLatency(newBaseLatency);
        setSlowSection(extra > 0);
    }, [tokenCount, controls]);

    useEffect(() => {
        //reset the text when the animation changes
        setNumId((prev) => prev + 1);
    }, [controls]);

    // Function to send a token at random intervals
    useEffect(() => {
        if (remainingTokens.length > 0) {
            // Jitter is up to 100ms more based on windowSize (unused)
            const jitter = Math.random() * 5;
            const networkDelay = baseLatency + jitter;

            const timeout = setTimeout(() => {
                const nextToken = remainingTokens[0];
                setCurrentText(prev => prev ? `${prev} ${nextToken}` : nextToken);
                setRemainingTokens(prev => prev.slice(1));
                setTokenCount(prev => prev + 1); // Increment token count
            }, networkDelay);

            return () => clearTimeout(timeout);
        } else {
            // reset the text when the animation changes
            setTimeout(() => {
                setNumId((prev) => prev + 1);
            }, 1000);
        }
    }, [remainingTokens, baseLatency]);

    // Initialize the tokens
    useEffect(() => {
        setRemainingTokens(initialText.split(' ')); // Assuming space-separated tokens
        setCurrentText('');
        setTokenCount(0);
    }, [initialText, numId]);

    const animationDurationString = `${controls.animationDuration}s`;
    return (
        <div className="flex flex-col md:flex-row justify-start items-start w-full gap-16">
            <div className="w-full max-w-80">
                <h1 className="text-3xl font-bold">FlowToken</h1>
                <div className="mb-4">
                    <span className="text-xs mb-4 text-gray-500 mr-2">In development</span>
                    <a href="https://github.com/Backless-AI/flowtoken" className="text-xs text-blue-500">Github</a>
                </div>
                <p className="text-sm mb-4">FlowToken is a text visualization library to animate and smooth streaming LLM token generation.</p>
                <Controls controls={controls} setControls={setControls} />
                <div className="h-10 text-red-500">
                    {slowSection && <p>Simulated Network Issue</p>}
                </div>
            </div>
            <div className="text-sm w-1/2 prose lg:prose-md prose-pre:p-0 prose-pre:m-0 prose-pre:bg-transparent" style={{ height: '3000px'}}>
                {currentText.length > 0 &&
                    <AnimatedMarkdown content={currentText} animation={controls.animation === 'none' ? undefined : controls.animation} sep={controls.sep} animationDuration={animationDurationString} animationTimingFunction={controls.animationTimingFunction} customComponents={customComponents} htmlComponents={htmlComponents}/>   
                }
            </div>
        </div>
    );
};

export default RandomTextSender;