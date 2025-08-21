import React from 'react';

const Spinner: React.FC<{fullScreen?: boolean}> = ({ fullScreen = true }) => {
    if (fullScreen) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-white">
              <i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
            </div>
        );
    }
    return <i className="fa-solid fa-spinner fa-spin"></i>;
};

export default Spinner;
