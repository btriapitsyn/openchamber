import React from 'react';

interface Controls {
    animation: string;
    sep: string;
    windowSize: number;
    delayMultiplier: number;
    animationDuration: number;
    animationTimingFunction: string;
    simulateNetworkIssue: boolean;
    generationSpeed: number;
}

const Controls = ({ controls, setControls }: { controls: Controls, setControls: React.Dispatch<React.SetStateAction<Controls>> }) => {
    const { animation, sep, windowSize, delayMultiplier, animationDuration, animationTimingFunction
     } = controls;

    const handleAnimationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setControls({ ...controls, animation: e.target.value });
    };

    const handleSepChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setControls({ ...controls, sep: e.target.value });
    };

    const handleWindowSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setControls({ ...controls, windowSize: parseInt(e.target.value) });
    };

    const handleDelayMultiplierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setControls({ ...controls, delayMultiplier: parseFloat(e.target.value) });
    };

    const handleAnimationDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setControls({ ...controls, animationDuration: parseFloat(e.target.value) });
    };

    const handleAnimationTimingFunctionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setControls({ ...controls, animationTimingFunction: e.target.value });
    };

    return (
        <div style={{ marginBottom: '1rem' }}>
            <label style={{ marginRight: '1rem' }}>
                Animation:
                <select value={animation} onChange={handleAnimationChange}>
                    <option value="none">None</option>
                    <option value="fadeIn">Fade In</option>
                    <option value="blurIn">Blur In</option>
                    <option value="slideInFromLeft">Slide In From Left</option>
                    <option value="fadeAndScale">Fade and Scale</option>
                    <option value="colorTransition">Color Transition</option>
                    <option value="rotateIn">Rotate In</option>
                    <option value="bounceIn">Bounce In</option>
                    <option value="elastic">Elastic</option>
                    <option value="highlight">Highlight</option>
                    <option value="blurAndSharpen">Blur and Sharpen</option>
                    <option value="wave">Wave</option>
                    <option value="dropIn">Drop In</option>
                    <option value="slideUp">Slide Up</option>
                </select>
            </label>
            <label style={{ marginRight: '1rem' }}>
                Separator:
                <select value={sep} onChange={handleSepChange}>
                    <option value="word">Word</option>
                    <option value="char">Character</option>
                </select>
            </label>
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Window Size:
                <input type="number" value={windowSize} onChange={handleWindowSizeChange} />
            </label>
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Delay Multiplier:
                <input type="number" value={delayMultiplier} onChange={handleDelayMultiplierChange} />
            </label>
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Animation Duration:
                <input type="text" value={animationDuration} onChange={handleAnimationDurationChange} />
            </label>
            <label style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column' }}>
                Animation Timing Function:
                <select value={animationTimingFunction} onChange={handleAnimationTimingFunctionChange}>
                    <option value="ease-in-out">Ease In Out</option>
                    <option value="ease-in">Ease In</option>
                    <option value="ease-out">Ease Out</option>
                    <option value="linear">Linear</option>
                </select>
            </label>
        </div>
    );
}

export default Controls;
