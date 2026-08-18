# app/utils/image_loader.py
import cv2
import numpy as np
import pydicom

def load_dicom(file_path):
    """Load and preprocess DICOM file"""
    ds = pydicom.dcmread(file_path)
    img = ds.pixel_array
    
    # Handle photometric interpretation (invert if needed)
    if hasattr(ds, 'PhotometricInterpretation'):
        if ds.PhotometricInterpretation == 'MONOCHROME1':
            img = np.max(img) - img
    
    # Apply rescale slope/intercept if present
    if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
        img = img * ds.RescaleSlope + ds.RescaleIntercept
    
    # Apply window leveling (optimize contrast for dental X-rays)
    if hasattr(ds, 'WindowCenter') and hasattr(ds, 'WindowWidth'):
        center = ds.WindowCenter
        width = ds.WindowWidth
        if isinstance(center, pydicom.multival.MultiValue):
            center = center[0]
        if isinstance(width, pydicom.multival.MultiValue):
            width = width[0]
        
        low = center - width // 2
        high = center + width // 2
        img = np.clip(img, low, high)
        img = ((img - low) / (high - low) * 255).astype(np.uint8)
    else:
        # Default normalization
        img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    return img

def load_image(file_path):
    """Load image from various formats"""
    file_ext = file_path.lower().split('.')[-1]
    
    # PNG, JPG, JPEG - use cv2
    if file_ext in ['png', 'jpg', 'jpeg']:
        img = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"Cannot read image: {file_path}")
        return img
    
    # DICOM - use pydicom
    elif file_ext == 'dcm':
        try:
            return load_dicom(file_path)
        except Exception as e:
            raise ValueError(f"Cannot read DICOM file: {e}")
    
    else:
        raise ValueError(f"Unsupported file format: {file_ext}. Supported: PNG, JPG, JPEG, DICOM (.dcm)")