import urllib.request, sys, os
urls=[
 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker_long/1/face_landmarker.task',
 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker_short/1/face_landmarker_short.task',
 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker_short/1/face_landmarker.task',
 'https://storage.googleapis.com/mediapipe/face_landmarker/face_landmarker.task'
]
os.makedirs('models', exist_ok=True)
for url in urls:
    try:
        print('Trying', url)
        dest='models/'+os.path.basename(url)
        urllib.request.urlretrieve(url, dest)
        print('Saved', dest)
        sys.exit(0)
    except Exception as e:
        print('Failed:', e)
print('All attempts failed')
