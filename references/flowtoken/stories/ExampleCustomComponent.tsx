import React from 'react';

const CustomComponent = ({ content }: { content: string }) => {
    const removedBraces = content.replace(/{{|}}/g, '');
    const timeoutRef = React.useRef<NodeJS.Timeout>();

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        const div = e.currentTarget;
        div.classList.remove('invisible');
        div.classList.add('visible');
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
        const div = e.currentTarget;
        timeoutRef.current = setTimeout(() => {
            div.classList.remove('visible');
            div.classList.add('invisible');
        }, 200); // 200ms delay before hiding
    };

    return (
        <span 
            className="text-red-500 bg-gray-100 p-1 rounded-md inline-block relative group cursor-help"
            title={`Learn more about "${removedBraces}"`}
        >
            {removedBraces}
            <div 
                className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-2 text-sm bg-white border rounded shadow-lg transition-all duration-200"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <a 
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(removedBraces)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline"
                >
                    View on Wikipedia
                </a>
                <p className="mt-1 text-gray-600">Click to learn more about this term on Wikipedia</p>
            </div>
        </span>
    );
};

export default CustomComponent;