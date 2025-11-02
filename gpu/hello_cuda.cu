#include <iostream>

__global__ void helloCUDA() {
    printf("Hello from GPU thread %d!\n", threadIdx.x);
}

int main() {
    helloCUDA<<<1, 8>>>();  // 1 block, 8 threads
    cudaDeviceSynchronize();
    std::cout << "Hello from CPU!" << std::endl;
    return 0;
}
