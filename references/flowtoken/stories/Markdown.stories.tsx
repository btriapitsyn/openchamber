import React from 'react';
import { text } from './TestMarkdown';
import RandomTextSender from './RandomMarkdownSender';
import CustomComponent from './ExampleCustomComponent';

// This is the default export that defines the component title and other configuration
export default {
    title: 'Components/Markdown',
    component: RandomTextSender,
};

// Here we define a "story" for the default view of SmoothText
export const DefaultMarkdown = () => <RandomTextSender 
    initialText={text} 
    windowSize={30} 
    customComponents={{
        'test': ({ text, content }: any) => {
            return <CustomComponent content={text} />;
        },
        'ArticlePreview': ({ title, description }: any) => {
            console.log('title', title);
            return <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>;
        }
    }}
/>;
