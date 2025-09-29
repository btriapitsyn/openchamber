import React, { useState, useEffect } from 'react';
import StreamingFadeInText from '../src/components/AnimatedText';

interface RandomTextSenderProps {
    initialText: string;
    windowSize: number;  // Propagate this to SmoothText for consistency
    animation?: string;  // Animation name
    sep?: string;  // Token separator
}

const RandomTextSender: React.FC<RandomTextSenderProps> = ({ initialText, windowSize, animation, sep }) => {
    const [currentText, setCurrentText] = useState('');
    const [remainingTokens, setRemainingTokens] = useState<string[]>([]);
    const [baseLatency, setBaseLatency] = useState<number>(100);
    const [tokenCount, setTokenCount] = useState<number>(0);

    // Initialize the tokens
    useEffect(() => {
        setRemainingTokens(initialText.split(' ')); // Assuming space-separated tokens
    }, [initialText]);

    // Update base latency every 10 tokens
    useEffect(() => {
        if (tokenCount > 0 && tokenCount % 10 === 0) {
            const newBaseLatency = baseLatency + (Math.random() > 0.5 ? 20 : 0); // Randomly choose between 200ms and 800ms
            setBaseLatency(newBaseLatency);
            console.log(`Base latency updated to: ${newBaseLatency}ms`);
        }
    }, [tokenCount]);

    // Function to send a token at random intervals
    useEffect(() => {
        if (remainingTokens.length > 0) {
            // Jitter is up to 100ms more based on windowSize (unused)
            const jitter = Math.random() * 10;
            const networkDelay = baseLatency + jitter;

            const timeout = setTimeout(() => {
                const nextToken = remainingTokens[0];
                setCurrentText(prev => prev ? `${prev} ${nextToken}` : nextToken);
                setRemainingTokens(prev => prev.slice(1));
                setTokenCount(prev => prev + 1); // Increment token count
            }, networkDelay);

            return () => clearTimeout(timeout);
        }
    }, [remainingTokens, baseLatency, windowSize]);

    return (
        <div>
            {/* <FadeInExample /> */}
            <StreamingFadeInText incomingText={currentText} animation={animation} sep={sep} />
            {/* <div style={{ marginTop: '1rem' }}>
                {currentText}
            </div> */}
        </div>
    );
};

// This is the default export that defines the component title and other configuration
export default {
    title: 'Components/FadeIn',
    component: RandomTextSender,
};

const text = `To be, or not to be, that is the question:
Whether 'tis nobler in the mind to suffer
The slings and arrows of outrageous fortune,
Or to take arms against a sea of troubles
And by opposing end them. To die—to sleep,
No more; and by a sleep to say we end
The heart-ache and the thousand natural shocks
That flesh is heir to: 'tis a consummation
Devoutly to be wish'd. To die, to sleep;
To sleep, perchance to dream—ay, there's the rub:
For in that sleep of death what dreams may come,
When we have shuffled off this mortal coil,
Must give us pause—there's the respect
That makes calamity of so long life.
For who would bear the whips and scorns of time,
Th'oppressor's wrong, the proud man's contumely,
The pangs of dispriz'd love, the law's delay,
The insolence of office, and the spurns
That patient merit of th'unworthy takes,
When he himself might his quietus make
With a bare bodkin? Who would fardels bear,
To grunt and sweat under a weary life,
But that the dread of something after death,
The undiscovere'd country, from whose bourn
No traveller returns, puzzles the will,
And makes us rather bear those ills we have
Than fly to others that we know not of?
Thus conscience doth make cowards of us all,
And thus the native hue of resolution
Is sicklied o'er with the pale cast of thought,
And enterprises of great pith and moment
With this regard their currents turn awry
And lose the name of action.
`

// Here we define a "story" for the default view of SmoothText
export const Default = () => <RandomTextSender initialText={text} windowSize={30} />;
export const DefaultChar = () => <RandomTextSender initialText={text} windowSize={30} sep="char" />;

// You can add more stories to showcase different props or states
export const fadeIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeIn"} />;
export const AllAtOnceFadeIn = () => <StreamingFadeInText incomingText={text} animation={"fadeIn"} />;

export const blurIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurIn"} />;
export const blurInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurIn"} sep="char" />;

// export const typewriter = () => <RandomTextSender initialText={text} windowSize={30} animation={"typewriter"} sep="char" />;

export const slideInFromLeft = () => <RandomTextSender initialText={text} windowSize={30} animation={"slideInFromLeft"} />;
export const slideInFromLeftChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"slideInFromLeft"} sep="char" />;

export const fadeAndScale = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeAndScale"} />;
export const fadeAndScaleChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"fadeAndScale"} sep="char" />;

export const colorTransition = () => <RandomTextSender initialText={text} windowSize={30} animation={"colorTransition"} />;

export const rotateIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"rotateIn"} />;
export const rotateInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"rotateIn"} sep="char" />;

export const bounceIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"bounceIn"} />;
export const bounceInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"bounceIn"} sep="char" />;

export const elastic = () => <RandomTextSender initialText={text} windowSize={30} animation={"elastic"} />;
export const elasticChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"elastic"} sep="char" />;

export const highlight = () => <RandomTextSender initialText={text} windowSize={30} animation={"highlight"} />;
export const highlightChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"highlight"} sep="char" />;

export const blurAndSharpen = () => <RandomTextSender initialText={text} windowSize={30} animation={"blurAndSharpen"} />;

export const wave = () => <RandomTextSender initialText={text} windowSize={30} animation={"wave"} />;
export const waveChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"wave"} sep="char" />;

export const dropIn = () => <RandomTextSender initialText={text} windowSize={30} animation={"dropIn"} />;
export const dropInChar = () => <RandomTextSender initialText={text} windowSize={30} animation={"dropIn"} sep="char" />;