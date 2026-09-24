import gradio as gr

gr.Interface(fn=lambda text: text, inputs="text", outputs="text").launch()
