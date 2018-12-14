# Dirty Forms - Mendix Widget

Provides various features to monitor, highlight, and act on field and dataview changes. 
Based on a highly modified version of below Plugin to support Mendix and below features.
(Dirty Forms jQuery Plugin | v2.0.0 | 2010-2015 Mal Curtis | License MIT)

## Contributing

For more information on contributing to this repository visit [Contributing to a GitHub repository](https://world.mendix.com/display/howto50/Contributing+to+a+GitHub+repository)!

## Typical usage scenario

- Indicate that certain fields or dataviews on the page have been modified (dirty) by the user and not submitted yet
- Display the original field values, by monitoring the user modifications or preload them from for example a audit trail
- Improve usability when editing many fields, provide options to restore values on screen by a simple field click or reset button
- Perform dirty / clean business logic on dataview-level by executing configurable microflows
- Ask for confirmation when a user closes the browser-window while the page is still 'dirty'
- A combination of any of the above scenarios

## Features and limitations

- Adds CSS classes to fields and dataviews when dirty / clean to support custom styling
- Show the original value underneath the input (adds a <p> with a bootstrap help-block class)
- Doubleclick on the original value to restore the input field value back to its original
- Use a reset-button to clean the entire dataview at once from all dirty fields and restore original values
- Use microflows to provide preloaded dirty values to be displayed already when the dataviews is initialized
- Trigger microflows to implement business logic when a dataview is dirty / clean
- Inform the user when they try to close the browser while the dataview is still dirty with unsaved edits
- Flexible to exclude nested dataviews, specific fields, etc, from dirty checking by adding a 'dirtyignore' class

Note: the preload feature expects the name/value pair prepared by the application to match the field-names in the dataview.

Note: the notification feature on closing the page is only triggered when user tries to close the actual browser itself. Any other undesired page exits when the page is still dirty via save- / cancel- / action- button behaviors are not known to this widget. If a notification is also desired for these situations, use the OnDirty / OnClean microflow behaviors to track the page it's dirty status and test against that in your microflows when leaving a page.

## When is a field or dataview considered 'dirty'?

A field, and thereby its respective dataview, is marked as dirty when a user starts modifying a input field on the screen. This does not necessarily means that the field will actually also be considered as changed already. To clarify, a user could leave the original input intact when the field is going out of focus, in which case both the dirty and subsequent clean behaviors will be triggered while the user was editing, but in the end the field value has not actually been changed so any on-change events will not be triggered.

Once a a dataview is marked as 'dirty' because of one or more dirty fields, any additional field modifications will not retrigger the dirty microflow as the dataview already is dirty. The clean behavior will only be triggered when all field modifications have somehow been restored to their original values again.

## Avoid certain fields or nested dataviews to be monitored by the widget

In case you do not want certain fields or dataviews to be monitored you can assign it a 'dirtyignore' class.

## Custom CSS classes

This widget adds a 'dirty' class to both the dataview and its input fields when it is considered dirty.
You can use this for example to higlight which fields are considered dirty or highlight only the form itself.
The dataview also gets a 'dirtylistening' class to be able show that the dataview is being monitored by the widget. The 'dirtyignore' class can be used to exclude both fields and / or nested dataviews from the widget and also indicate that to the user by providing custom styling.

Note: none of these classes have any default style.

## Mendix widget properties

- Preload Microflow: The microflow to preload name/dirty-value pairs during initialisation
- NameValue pair: The entity used by the Preload Microflow as return values with a name/value pair
- Name attribute: The attribute used to identify the field that is dirty
- Value attribute: The attribute used to preload the dirty value of the field

- Display original: Display the original value underneath the field when it gets dirty
- Prefix original: The prefix text that will be displayed before the original value

- Click to reset: Doubleclick the orignal value to reset the field back to its original
- Reset button: Provide a reset button to reset all fields to their original value

- Notify browser close: Notify the user when they try to close the browser while fields are still dirty

- OnDirty: The microflow to execute when the form becomes dirty
- OnClean: The microflow to execute when the form becomes clean again

## Dependencies

- Tested on Mendix 5.19.0 and up