from setuptools import setup, find_packages

setup(
    name="fonbridge-outreach",
    version="1.0.0",
    description="FonBridge Uzman Ulaşım ve Akıllı İletişim Modülü (24 AB Dili + TR, Yarı Otomatik LinkedIn Outreach)",
    author="FonBridge Team",
    packages=find_packages(),
    py_modules=["fonbridge_module", "config"],
    install_requires=[
        "pandas>=2.0.0",
        "openpyxl>=3.1.0",
        "streamlit>=1.30.0",
        "bcrypt>=4.0.0",
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.9",
)
