from ultralytics import YOLO

# Explicit absolute path to the correct data.yaml
data_path = "/Users/kaleb/Desktop/College WM/ai_project/data.yaml"

model = YOLO("yolov8s.pt")
model.train(
    data=data_path,
    epochs=5,
    imgsz=640,
    name="benthic_yolov8"
)
