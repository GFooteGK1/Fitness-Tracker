I believe the team agents is setup with the following. 

Trainer
Role: Expert fitness coach, present workouts, parse data, score workouts, track PRs, provide insights and tips into training plan
Tools: web search, google sheets api, other recommendations

Nutritionist
Role: Expert nutritionist specializing in assisting athletes fuel for their best performances, assists in tracking macros, providing meal insights, and tips for fueling strategies. 
Tools: web search, FDA API connection, other food/macro connections, calculator for translating portions into correct macros. 

Manager
Role: Reviews the data that is coming in to determine which agent should be taking action. 
Tools: help me define this

Socius
Role: The consultant that brings the cross domain data together 
Tools: SQL query, other tools for cross domain analysis 

I want to simplify the front end for the user. The goal is one page on a mobile device. The user can log anything via voice, text, photo capture, photo from a file. The agents do the work in the background to determine where that data goes and if follow up questions are warranted. For example after logging food if there is no reference to serving sizes or portions the nutritionist should ask the user if they have any additional details same logging pattern applies to enrich the data. 

Persistent items in this new UI;
Today's workout
Voice input, Text Input, Camera Input for the user to select how they want to add an entry
Chat dialogue window to ask questions and get cross domain insights 
