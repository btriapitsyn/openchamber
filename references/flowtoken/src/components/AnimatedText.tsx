import React, { useState, useEffect, useRef } from 'react';

interface StreamingFadeInTextProps {
    incomingText: string;  // Each new token received for display
    animation?: string;  // Animation name
    sep?: string;  // Token separator
}

const StreamingFadeInText: React.FC<StreamingFadeInTextProps> = ({ incomingText, animation="", sep="token" }) => {
    const [animatingTokens, setAnimatingTokens] = useState<{token: string, id: number}[]>([]);
    const [completedTokens, setCompletedTokens] = useState<string[]>([]);
    const lastTokenTime = useRef<number | null>(performance.now());
    const numId = useRef<number>(0);
    const receivedText = useRef<string>('');
    const animationDuration = '0.5s';
    const animationTimingFunction = 'ease-in-out';

    useEffect(() => {
        if (incomingText) {
            const textToSplit = incomingText.slice(receivedText.current.length);

            // Split the text and include spaces in the tokens list
            let newTokens: string[] = [];
            if (sep === 'token') {
                newTokens = textToSplit.split(/(\s+)/).filter(token => token.length > 0);
            } else if (sep === 'char') {
                newTokens = textToSplit.split('');
                // console.log('New tokens:', newTokens);
            } else {
                throw new Error('Invalid separator');
            }
            const newTokenObjects = newTokens.map(token => ({ token, id: numId.current++ }));
            if (newTokenObjects.length === 0) return;
            newTokenObjects.forEach((token, index) => {
                const delay = 10 - (performance.now() - (lastTokenTime.current || 0));
                lastTokenTime.current = Math.max(performance.now() + delay, lastTokenTime.current || 0);
                setTimeout(() => {
                    setAnimatingTokens(prev => [...prev, token]);
                }, delay);
            });
            // setAnimatingTokens(prev => [...prev, ...newTokenObjects]);
            receivedText.current = incomingText;
        }
    }, [incomingText]);

    // const handleAnimationEnd = (token?: string) => {
    //     console.log('Animation:', animatingTokens);
    //     setAnimatingTokens((prev) => {
    //         const prevToken = prev[0].token;
    //         console.log('Token:', prevToken);
    //         setCompletedTokens(prev => [...prev, prevToken]);
    //         return prev.slice(1);
    //     });
    // };

    return (
        <div>
            <span
            >{completedTokens.join('')}</span>
            {animatingTokens.map(({token, id}) => {
                if (token === '\n') return <br key={id} />;

                return <span
                    key={id}
                    style={{
                        animationName: animation,
                        animationDuration: animationDuration,
                        animationTimingFunction: animationTimingFunction,
                        animationIterationCount: 1,
                        whiteSpace: 'pre',
                        display: 'inline-block',
                    }}
                    // onAnimationEnd={() => handleAnimationEnd(token)}
                >
                    {token}
                </span>
            })}
        </div>
    );
};

export default StreamingFadeInText;